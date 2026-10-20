import { describe, expect, it } from "vitest";
import {
  FakeFulfillAdapter,
  PayWebhookSignatureError,
  type CaptureAuthorizedInput,
  type ChargeInput,
  type ChargeResult,
  type PayAdapter,
  type PayWebhookEvent,
  type VoidAuthorizationInput,
} from "@cutoff/adapters";
import { createApp } from "./app.js";
import {
  defaultCommitEvidence,
  seedHouseholdWithMandateAndAgent,
  testBindings,
} from "./test-helpers.js";

class ManualPay implements PayAdapter {
  readonly captureMode = "manual" as const;
  readonly attempts: ChargeInput[] = [];
  readonly captures: CaptureAuthorizedInput[] = [];
  readonly voids: VoidAuthorizationInput[] = [];
  private readonly byKey = new Map<string, ChargeResult>();
  private seq = 0;
  webhook: PayWebhookEvent | null = null;

  async charge(input: ChargeInput): Promise<ChargeResult> {
    this.attempts.push({ ...input });
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) return existing;
    this.seq += 1;
    const result = {
      chargeId: `pi_manual_${this.seq}`,
      amountCents: input.amountCents,
    };
    this.byKey.set(input.idempotencyKey, result);
    return result;
  }

  async captureAuthorized(input: CaptureAuthorizedInput): Promise<ChargeResult> {
    this.captures.push(input);
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) return existing;
    const result = {
      chargeId: input.authorizationId,
      amountCents: input.amountCents,
    };
    this.byKey.set(input.idempotencyKey, result);
    return result;
  }

  async voidAuthorization(input: VoidAuthorizationInput): Promise<void> {
    this.voids.push(input);
  }

  verifyWebhook(rawBody: string, signature: string | undefined): PayWebhookEvent {
    if (signature !== "t=1,v1=test") throw new PayWebhookSignatureError();
    return JSON.parse(rawBody) as PayWebhookEvent;
  }
}

async function quotedCommit(pay: ManualPay, fulfill?: FakeFulfillAdapter) {
  const bindings = testBindings({ pay, ...(fulfill ? { fulfill } : {}) });
  const app = createApp();
  const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);
  const quoteRes = await app.fetch(
    new Request("http://localhost/v1/quotes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${agent.secret}`,
      },
      body: JSON.stringify({
        mandate_id: mandate.mandateId,
        canonical_item_id: "item_towels_12",
        qty: 1,
        deliver_by: "2026-10-22",
      }),
    }),
    bindings,
  );
  expect(quoteRes.status).toBe(201);
  const quoted = (await quoteRes.json()) as { quote_id: string };
  return { bindings, app, agent, quoteId: quoted.quote_id };
}

function commitRequest(secret: string, quoteId: string, key: string) {
  return new Request("http://localhost/v1/commits", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${secret}`,
      "Idempotency-Key": key,
    },
    body: JSON.stringify({ quote_id: quoteId, ...defaultCommitEvidence }),
  });
}

describe("manual capture commit", () => {
  it("authorizes on the order id and captures only after placement", async () => {
    const pay = new ManualPay();
    const { bindings, app, agent, quoteId } = await quotedCommit(pay);
    const first = await app.fetch(
      commitRequest(agent.secret, quoteId, "idem_stripe_a"),
      bindings,
    );
    expect(first.status).toBe(201);
    const body = (await first.json()) as {
      order_id: string;
      status: string;
      job_id: string;
    };
    expect(body.status).toBe("placed");
    expect(pay.attempts).toHaveLength(1);
    expect(pay.attempts[0]?.idempotencyKey).toBe(body.order_id);
    expect(pay.captures).toHaveLength(1);
    expect(pay.captures[0]?.idempotencyKey).toBe(`${body.order_id}:capture`);
    expect(pay.voids).toHaveLength(0);
    expect(await bindings.orders.chargeCount()).toBe(1);
    const order = await bindings.orders.get(body.order_id);
    expect(order?.status).toBe("placed");
    expect(order?.chargeId).toBe(pay.captures[0]?.authorizationId);

    const second = await app.fetch(
      commitRequest(agent.secret, quoteId, "idem_stripe_b"),
      bindings,
    );
    expect(second.status).toBe(200);
    expect(pay.attempts).toHaveLength(1);
    expect(pay.captures).toHaveLength(1);
    expect(await bindings.orders.chargeCount()).toBe(1);
    expect(bindings.fulfillment.listJobs()).toHaveLength(1);
  });

  it("voids the authorization when placement fails and does not refund captured funds", async () => {
    const pay = new ManualPay();
    const fulfill = new FakeFulfillAdapter();
    fulfill.failNextPlace = true;
    const { bindings, app, agent, quoteId } = await quotedCommit(pay, fulfill);
    const res = await app.fetch(
      commitRequest(agent.secret, quoteId, "idem_stripe_fail"),
      bindings,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { order_id: string; refund_id?: string };
    expect(body.refund_id).toBeUndefined();
    expect(pay.captures).toHaveLength(0);
    expect(pay.voids).toHaveLength(1);
    expect(pay.voids[0]?.idempotencyKey).toBe(`${body.order_id}:void`);
    expect(await bindings.orders.chargeCount()).toBe(0);
    expect(bindings.fulfillment.listRefunds(body.order_id)).toHaveLength(0);
    const order = await bindings.orders.get(body.order_id);
    expect(order?.status).toBe("failed");
  });

  it("rejects an unsigned Stripe webhook and applies a verified refund", async () => {
    const pay = new ManualPay();
    const { bindings, app, agent, quoteId } = await quotedCommit(pay);
    const committed = await app.fetch(
      commitRequest(agent.secret, quoteId, "idem_stripe_hook"),
      bindings,
    );
    const body = (await committed.json()) as {
      order_id: string;
      amount_cents: number;
    };
    const order = await bindings.orders.get(body.order_id);
    expect(order?.chargeId).toBeTruthy();

    const missing = await app.fetch(
      new Request("http://localhost/v1/webhooks/stripe", {
        method: "POST",
        body: "{}",
      }),
      bindings,
    );
    expect(missing.status).toBe(400);

    const refunded = await app.fetch(
      new Request("http://localhost/v1/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=test" },
        body: JSON.stringify({
          type: "refunded",
          paymentIntentId: order?.chargeId ?? null,
          orderId: null,
          amountCents: body.amount_cents,
        } satisfies PayWebhookEvent),
      }),
      bindings,
    );
    expect(refunded.status).toBe(200);
    expect(await refunded.json()).toMatchObject({
      received: true,
      type: "refunded",
    });
    expect((await bindings.orders.get(body.order_id))?.status).toBe("refunded");
  });

  it("does not offer plan checkout on the fake adapter", async () => {
    const bindings = testBindings();
    const app = createApp();
    const res = await app.fetch(
      new Request("http://localhost/v1/households/hh_x/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@example.com" }),
      }),
      bindings,
    );
    expect(res.status).toBe(404);
  });
});
