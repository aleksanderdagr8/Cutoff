import { describe, expect, it } from "vitest";
import {
  AGENT_ORDER_RECEIPT_KEYS,
  OrderTrackingResponseSchema,
} from "@cutoff/contracts";
import {
  AGENT_ORDER_RECEIPT_FORBIDDEN_KEYS,
  agentOrderReceiptHasForbiddenKey,
  agentOrderReceiptUnknownKeys,
} from "@cutoff/domain";
import { createApp } from "./app.js";
import {
  defaultCommitEvidence,
  seedHouseholdWithMandateAndAgent,
  testBindings,
} from "./test-helpers.js";

describe("Phase 10 — Unit 16 agent order receipt", () => {
  it("GET /v1/orders/:orderId returns allowlisted receipt summary", async () => {
    const bindings = testBindings();
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
    const quote = (await quoteRes.json()) as { quote_id: string };

    const commitRes = await app.fetch(
      new Request("http://localhost/v1/commits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
          "Idempotency-Key": "idem_u16_receipt",
        },
        body: JSON.stringify({
          quote_id: quote.quote_id,
          ...defaultCommitEvidence,
        }),
      }),
      bindings,
    );
    expect(commitRes.status).toBe(201);
    const commit = (await commitRes.json()) as {
      order_id: string;
      receipt_token?: string;
    };

    const track = await app.fetch(
      new Request(`http://localhost/v1/orders/${commit.order_id}`, {
        headers: { Authorization: `Bearer ${agent.secret}` },
      }),
      bindings,
    );
    expect(track.status).toBe(200);
    const raw = (await track.json()) as Record<string, unknown>;
    const body = OrderTrackingResponseSchema.parse(raw);

    expect(Object.keys(raw).sort()).toEqual(
      [...AGENT_ORDER_RECEIPT_KEYS].sort(),
    );
    expect(agentOrderReceiptUnknownKeys(raw)).toEqual([]);
    expect(agentOrderReceiptHasForbiddenKey(raw)).toBe(false);

    expect(body.order_id).toBe(commit.order_id);
    expect(body.amount_cents).toBe(1299);
    expect(body.canonical_item_id).toBe("item_towels_12");
    expect(body.display_name).toBe("Paper towels, 12-roll pack");
    expect(body.fulfiller_id).toBe("fulfiller_a");
    expect(body.why_this_seller).toEqual({
      landed_cents: 1299,
      delivery_date: "2026-10-21",
      merchant_score: 0,
    });
    expect(body.receipt_url).toBe(`/home/receipts/${commit.receipt_token}`);
    expect(body.summary).toContain("Paper towels");
    expect(body.summary).toContain("$12.99");

    // Explicit no-PII contract: none of the forbidden keys appear.
    for (const key of AGENT_ORDER_RECEIPT_FORBIDDEN_KEYS) {
      expect(raw).not.toHaveProperty(key);
    }
    expect(JSON.stringify(raw)).not.toMatch(/@example\.com/);
    expect(JSON.stringify(raw)).not.toContain("secret_hash");
  });

  it("read_list alone can fetch the agent receipt summary", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(
      bindings,
      { scopes: ["quote", "commit", "read_list"] },
    );

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
    const quote = (await quoteRes.json()) as { quote_id: string };
    const commitRes = await app.fetch(
      new Request("http://localhost/v1/commits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
          "Idempotency-Key": "idem_u16_reader",
        },
        body: JSON.stringify({
          quote_id: quote.quote_id,
          ...defaultCommitEvidence,
        }),
      }),
      bindings,
    );
    const commit = (await commitRes.json()) as { order_id: string };

    const { agent: reader } = await seedHouseholdWithMandateAndAgent(
      bindings,
      { scopes: ["read_list"] },
    );
    // Wrong household reader must 404 — re-seed creates a different hh.
    const denied = await app.fetch(
      new Request(`http://localhost/v1/orders/${commit.order_id}`, {
        headers: { Authorization: `Bearer ${reader.secret}` },
      }),
      bindings,
    );
    expect(denied.status).toBe(404);

    // Same-household read_list key.
    const readerSame = await bindings.agents.issue({
      householdId: (await bindings.orders.get(commit.order_id))!.householdId,
      scopes: ["read_list"],
      mandateIds: [mandate.mandateId],
    });
    const ok = await app.fetch(
      new Request(`http://localhost/v1/orders/${commit.order_id}`, {
        headers: { Authorization: `Bearer ${readerSame.secret}` },
      }),
      bindings,
    );
    expect(ok.status).toBe(200);
    OrderTrackingResponseSchema.parse(await ok.json());
  });
});
