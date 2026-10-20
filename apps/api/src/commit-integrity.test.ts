import { describe, expect, it } from "vitest";
import { FakeFulfillAdapter, FakePayAdapter } from "@cutoff/adapters";
import { createApp } from "./app.js";
import { placeAfterCapture } from "./handlers/fulfill.js";
import {
  defaultCommitEvidence,
  seedHouseholdWithMandateAndAgent,
  testBindings,
} from "./test-helpers.js";

async function quote(
  app: ReturnType<typeof createApp>,
  bindings: ReturnType<typeof testBindings>,
  opts: { mandateId: string; secret: string },
) {
  const res = await app.fetch(
    new Request("http://localhost/v1/quotes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${opts.secret}`,
      },
      body: JSON.stringify({
        mandate_id: opts.mandateId,
        canonical_item_id: "item_towels_12",
        qty: 1,
        deliver_by: "2026-10-22",
      }),
    }),
    bindings,
  );
  expect(res.status).toBe(201);
  return (await res.json()) as { quote_id: string };
}

function commitRequest(secret: string, quoteId: string, idempotencyKey: string) {
  return new Request("http://localhost/v1/commits", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${secret}`,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      quote_id: quoteId,
      ...defaultCommitEvidence,
    }),
  });
}

describe("commit integrity", () => {
  it("two idempotency keys on one quote produce one order and one charge", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);
    const pay = bindings.pay as FakePayAdapter;
    const quoted = await quote(app, bindings, {
      mandateId: mandate.mandateId,
      secret: agent.secret,
    });

    const first = await app.fetch(
      commitRequest(agent.secret, quoted.quote_id, "idem_a"),
      bindings,
    );
    const second = await app.fetch(
      commitRequest(agent.secret, quoted.quote_id, "idem_b"),
      bindings,
    );
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    const a = (await first.json()) as {
      order_id: string;
      created: boolean;
      job_id: string;
    };
    const b = (await second.json()) as {
      order_id: string;
      created: boolean;
      job_id: string;
    };
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.order_id).toBe(a.order_id);
    expect(b.job_id).toBe(a.job_id);
    expect(await bindings.orders.count()).toBe(1);
    expect(pay.charges).toHaveLength(1);
    expect(pay.attempts[0]?.idempotencyKey).toBe(a.order_id);
    expect(bindings.fulfillment.listJobs()).toHaveLength(1);

    const quoteRow = await bindings.quotes.get(quoted.quote_id);
    expect(quoteRow?.committedAtUtc).toBeTruthy();
  });

  it("placing the same order twice keeps one job", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);
    const quoted = await quote(app, bindings, {
      mandateId: mandate.mandateId,
      secret: agent.secret,
    });
    const res = await app.fetch(
      commitRequest(agent.secret, quoted.quote_id, "idem_place"),
      bindings,
    );
    const body = (await res.json()) as {
      order_id: string;
      job_id: string;
      household_id: string;
      amount_cents: number;
    };
    const order = await bindings.orders.get(body.order_id);
    expect(order).toBeTruthy();
    const again = await placeAfterCapture(bindings, {
      orderId: body.order_id,
      householdId: body.household_id,
      canonicalItemId: "item_towels_12",
      amountCents: body.amount_cents,
      quoteId: quoted.quote_id,
    });
    expect(again).toEqual({ ok: true, jobId: body.job_id });
    expect(bindings.fulfillment.listJobs()).toHaveLength(1);
    expect((bindings.fulfill as FakeFulfillAdapter).jobs).toHaveLength(1);
  });

  it("a failed place retries as the same refund", async () => {
    const fulfill = new FakeFulfillAdapter();
    fulfill.failNextPlace = true;
    const bindings = testBindings({ fulfill });
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);
    const quoted = await quote(app, bindings, {
      mandateId: mandate.mandateId,
      secret: agent.secret,
    });
    const res = await app.fetch(
      commitRequest(agent.secret, quoted.quote_id, "idem_place_fail"),
      bindings,
    );
    const body = (await res.json()) as {
      order_id: string;
      refund_id: string;
      household_id: string;
      amount_cents: number;
    };
    expect(body.refund_id).toBeTruthy();
    const again = await placeAfterCapture(bindings, {
      orderId: body.order_id,
      householdId: body.household_id,
      canonicalItemId: "item_towels_12",
      amountCents: body.amount_cents,
      quoteId: quoted.quote_id,
    });
    expect(again).toEqual({
      ok: false,
      refundId: body.refund_id,
      error: "place_failed",
    });
    expect(bindings.fulfillment.listRefunds(body.order_id)).toHaveLength(1);
    expect(bindings.fulfillment.listJobs()).toHaveLength(0);
  });

  it("production hides phase0 and reports unhealthy health", async () => {
    const app = createApp();
    const prod = {
      ...testBindings(),
      production: true,
      reposMode: "postgres" as const,
      fakeIntegrations: true,
    };
    const phase0 = await app.fetch(
      new Request("http://localhost/v1/_phase0/commits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      prod,
    );
    expect(phase0.status).toBe(404);

    const health = await app.fetch(
      new Request("http://localhost/health"),
      prod,
    );
    expect(health.status).toBe(503);
    expect(await health.json()).toMatchObject({
      ok: false,
      service: "cutoff-api",
      reasons: ["fake_integrations"],
      repos: "postgres",
      integrations: "fake",
    });

    const memory = await app.fetch(
      new Request("http://localhost/health"),
      { ...testBindings(), production: true, reposMode: "memory" as const },
    );
    expect(memory.status).toBe(503);
    const memoryBody = (await memory.json()) as { reasons: string[] };
    expect(memoryBody.reasons).toContain("memory_repos");
    expect(memoryBody.reasons).toContain("fake_integrations");
  });
});
