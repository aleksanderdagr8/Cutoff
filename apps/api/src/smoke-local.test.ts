/**
 * Local end-to-end smoke (no live Stripe / Supabase / Wrangler).
 *
 * Runs the real Hono app against in-memory fakes:
 *   health → quote → commit ×2 (idempotent) → order → receipt
 *
 * Invoke from repo root: `pnpm run smoke:local`
 */
import { describe, expect, it } from "vitest";
import { FakePayAdapter } from "@cutoff/adapters";
import { createApp } from "./app.js";
import {
  defaultCommitEvidence,
  seedHouseholdWithMandateAndAgent,
  testBindings,
} from "./test-helpers.js";

function step(label: string, detail?: string) {
  const suffix = detail ? ` — ${detail}` : "";
  console.log(`  ✓ ${label}${suffix}`);
}

describe("smoke:local — quote → commit → receipt (fakes)", () => {
  it("proves health, quote, idempotent commit, order, and receipt", async () => {
    console.log("\nsmoke:local (in-memory fakes, no network)\n");

    const bindings = testBindings();
    const app = createApp();
    const { household, member, mandate, agent } =
      await seedHouseholdWithMandateAndAgent(bindings);
    const pay = bindings.pay as FakePayAdapter;

    // 1. Health
    const healthRes = await app.fetch(
      new Request("http://localhost/health"),
      bindings,
    );
    expect(healthRes.status).toBe(200);
    const health = (await healthRes.json()) as {
      ok: boolean;
      service: string;
      phase: string;
    };
    expect(health).toEqual({
      ok: true,
      service: "cutoff-api",
      phase: "6",
    });
    step("GET /health", `ok phase=${health.phase}`);

    // 2. Quote
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
    const quote = (await quoteRes.json()) as {
      quote_id: string;
      landed_cents: number;
      fulfiller_id: string;
    };
    expect(quote.quote_id.length).toBeGreaterThan(8);
    expect(quote.landed_cents).toBeGreaterThan(0);
    step(
      "POST /v1/quotes",
      `${quote.quote_id} landed=${quote.landed_cents} fulfiller=${quote.fulfiller_id}`,
    );

    const idempotencyKey = "idem_smoke_local";
    const commitBody = JSON.stringify({
      quote_id: quote.quote_id,
      ...defaultCommitEvidence,
    });

    // 3. Commit (first)
    const firstRes = await app.fetch(
      new Request("http://localhost/v1/commits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: commitBody,
      }),
      bindings,
    );
    expect(firstRes.status).toBe(201);
    const first = (await firstRes.json()) as {
      order_id: string;
      created: boolean;
      status: string;
      receipt_token: string;
      evidence_id: string;
    };
    expect(first.created).toBe(true);
    expect(first.status).toBe("placed");
    expect(first.receipt_token).toMatch(/^rcpt_/);
    step(
      "POST /v1/commits (1st)",
      `${first.order_id} created=true status=${first.status}`,
    );

    // 4. Commit again — same key must not double-charge
    const secondRes = await app.fetch(
      new Request("http://localhost/v1/commits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: commitBody,
      }),
      bindings,
    );
    expect(secondRes.status).toBe(200);
    const second = (await secondRes.json()) as {
      order_id: string;
      created: boolean;
    };
    expect(second.created).toBe(false);
    expect(second.order_id).toBe(first.order_id);
    expect(pay.charges).toHaveLength(1);
    expect(await bindings.orders.count()).toBe(1);
    step(
      "POST /v1/commits (2nd)",
      `same order_id, created=false, charges=${pay.charges.length}`,
    );

    // 5. Fetch order tracking
    const orderRes = await app.fetch(
      new Request(`http://localhost/v1/orders/${first.order_id}`, {
        headers: { Authorization: `Bearer ${agent.secret}` },
      }),
      bindings,
    );
    expect(orderRes.status).toBe(200);
    const order = (await orderRes.json()) as {
      order_id: string;
      status: string;
    };
    expect(order.order_id).toBe(first.order_id);
    step("GET /v1/orders/:id", `status=${order.status}`);

    // 6. Fetch receipt (member session headers — no agent key required)
    const receiptRes = await app.fetch(
      new Request(`http://localhost/v1/receipts/${first.receipt_token}`, {
        headers: {
          "X-Cutoff-Member-Id": member.memberId,
          "X-Cutoff-Member-Household-Id": household.householdId,
        },
      }),
      bindings,
    );
    expect(receiptRes.status).toBe(200);
    const receipt = (await receiptRes.json()) as {
      order_id: string;
      landed_cents: number;
      fulfiller_id: string;
    };
    expect(receipt.order_id).toBe(first.order_id);
    expect(receipt.landed_cents).toBe(quote.landed_cents);
    expect(receipt.fulfiller_id).toBe(quote.fulfiller_id);
    step(
      "GET /v1/receipts/:token",
      `order=${receipt.order_id} landed=${receipt.landed_cents}`,
    );

    console.log("\nsmoke:local PASS\n");
  });
});
