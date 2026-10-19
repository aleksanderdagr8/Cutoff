import { describe, expect, it } from "vitest";
import {
  FakeFulfillAdapter,
  signOutboundWebhook,
} from "@cutoff/adapters";
import { createApp } from "./app.js";
import {
  defaultCommitEvidence,
  seedHouseholdWithMandateAndAgent,
  testBindings,
  TEST_WEBHOOK_SECRET,
} from "./test-helpers.js";

async function quoteAndCommit(
  app: ReturnType<typeof createApp>,
  bindings: ReturnType<typeof testBindings>,
  opts: {
    mandateId: string;
    secret: string;
    idempotencyKey: string;
  },
) {
  const quoteRes = await app.fetch(
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
  expect(quoteRes.status).toBe(201);
  const quote = (await quoteRes.json()) as {
    quote_id: string;
    fulfiller_id: string;
  };

  const commitRes = await app.fetch(
    new Request("http://localhost/v1/commits", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${opts.secret}`,
        "Idempotency-Key": opts.idempotencyKey,
      },
      body: JSON.stringify({
        quote_id: quote.quote_id,
        ...defaultCommitEvidence,
      }),
    }),
    bindings,
  );
  return { quote, commitRes };
}

describe("Phase 5 — Unit 10 receipt console", () => {
  it("household member can open the receipt; non-member cannot", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { household, member, mandate, agent } =
      await seedHouseholdWithMandateAndAgent(bindings);

    const other = await bindings.households.createHousehold(
      "Other",
      "b@example.com",
    );

    const { commitRes } = await quoteAndCommit(app, bindings, {
      mandateId: mandate.mandateId,
      secret: agent.secret,
      idempotencyKey: "idem_p5_rcpt",
    });
    expect(commitRes.status).toBe(201);
    const commit = (await commitRes.json()) as {
      receipt_token: string;
      order_id: string;
    };
    expect(commit.receipt_token).toMatch(/^rcpt_/);

    const ok = await app.fetch(
      new Request(`http://localhost/v1/receipts/${commit.receipt_token}`, {
        headers: {
          "X-Cutoff-Member-Id": member.memberId,
          "X-Cutoff-Member-Household-Id": household.householdId,
        },
      }),
      bindings,
    );
    expect(ok.status).toBe(200);
    const receipt = (await ok.json()) as {
      order_id: string;
      landed_cents: number;
      fulfiller_id: string;
      why_this_seller: {
        landed_cents: number;
        delivery_date: string;
        merchant_score: number;
      };
      skip_available: boolean;
    };
    expect(receipt.order_id).toBe(commit.order_id);
    expect(receipt.landed_cents).toBe(1299);
    expect(receipt.fulfiller_id).toBe("fulfiller_a");
    expect(receipt.why_this_seller.landed_cents).toBe(1299);
    expect(receipt.skip_available).toBe(true);

    const denied = await app.fetch(
      new Request(`http://localhost/v1/receipts/${commit.receipt_token}`, {
        headers: {
          "X-Cutoff-Member-Id": other.member.memberId,
          "X-Cutoff-Member-Household-Id": other.household.householdId,
        },
      }),
      bindings,
    );
    expect(denied.status).toBe(401);
  });

  it("receipt renders with the agent credential revoked", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { household, member, mandate, agent } =
      await seedHouseholdWithMandateAndAgent(bindings);

    const { commitRes } = await quoteAndCommit(app, bindings, {
      mandateId: mandate.mandateId,
      secret: agent.secret,
      idempotencyKey: "idem_p5_revoke",
    });
    const commit = (await commitRes.json()) as { receipt_token: string };

    await bindings.agents.revoke(agent.keyId);

    const agentCall = await app.fetch(
      new Request("http://localhost/v1/list", {
        headers: { Authorization: `Bearer ${agent.secret}` },
      }),
      bindings,
    );
    expect(agentCall.status).toBe(401);

    const receipt = await app.fetch(
      new Request(`http://localhost/v1/receipts/${commit.receipt_token}`, {
        headers: {
          "X-Cutoff-Member-Id": member.memberId,
          "X-Cutoff-Member-Household-Id": household.householdId,
        },
      }),
      bindings,
    );
    expect(receipt.status).toBe(200);
    const body = (await receipt.json()) as { item: { description: string } };
    expect(body.item.description.length).toBeGreaterThan(0);
  });

  it("skip after ship opens a return request (no cancel)", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { household, member, mandate, agent } =
      await seedHouseholdWithMandateAndAgent(bindings, { allowCancel: true });

    const { commitRes } = await quoteAndCommit(app, bindings, {
      mandateId: mandate.mandateId,
      secret: agent.secret,
      idempotencyKey: "idem_p5_return",
    });
    const commit = (await commitRes.json()) as {
      receipt_token: string;
      order_id: string;
      job_id: string;
    };

    const body = JSON.stringify({
      event_id: "ful_evt_p5",
      order_id: commit.order_id,
      job_id: commit.job_id,
      status: "shipped",
      tracking_number: "1Z555",
      occurred_at: "2026-10-19T12:00:00.000Z",
    });
    const headers = await signOutboundWebhook(
      TEST_WEBHOOK_SECRET,
      Math.floor(Date.parse("2026-10-19T12:00:00.000Z") / 1000),
      body,
    );
    await app.fetch(
      new Request("http://localhost/v1/webhooks/fulfill", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
      }),
      bindings,
    );

    const skip = await app.fetch(
      new Request(
        `http://localhost/v1/receipts/${commit.receipt_token}/skip`,
        {
          method: "POST",
          headers: {
            "X-Cutoff-Member-Id": member.memberId,
            "X-Cutoff-Member-Household-Id": household.householdId,
          },
        },
      ),
      bindings,
    );
    expect(skip.status).toBe(200);
    const json = (await skip.json()) as {
      action: string;
      return_id: string;
    };
    expect(json.action).toBe("return_request");
    expect(json.return_id).toBeTruthy();
    expect(bindings.fulfillment.listReturnRequests(commit.order_id)).toHaveLength(
      1,
    );
  });
});

describe("Phase 5 — Unit 11 list and reorder", () => {
  it("reorder picks the newly cheaper fulfiller (not sticky)", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { household, mandate, agent } =
      await seedHouseholdWithMandateAndAgent(bindings);

    const upsert = await app.fetch(
      new Request(
        `http://localhost/v1/households/${household.householdId}/list`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mandate_id: mandate.mandateId,
            canonical_item_id: "item_towels_12",
            cadence_hint_days: 30,
            never_substitute: true,
          }),
        },
      ),
      bindings,
    );
    expect(upsert.status).toBe(201);
    const line = (await upsert.json()) as { line_id: string };

    const first = await app.fetch(
      new Request("http://localhost/v1/list/reorder", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({
          list_line_id: line.line_id,
          qty: 1,
          deliver_by: "2026-10-22",
        }),
      }),
      bindings,
    );
    expect(first.status).toBe(201);
    const q1 = (await first.json()) as {
      quote_id: string;
      fulfiller_id: string;
      landed_cents: number;
    };
    expect(q1.fulfiller_id).toBe("fulfiller_a");
    expect(q1.landed_cents).toBe(1299);

    // Consume the hold so a second reorder can open a new quote.
    await app.fetch(
      new Request("http://localhost/v1/commits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
          "Idempotency-Key": "idem_p5_reorder_1",
        },
        body: JSON.stringify({
          quote_id: q1.quote_id,
          ...defaultCommitEvidence,
        }),
      }),
      bindings,
    );

    // Flip prices: B becomes cheaper. Reorder must not stick to A.
    bindings.offers.upsertNormalized({
      canonicalItemId: "item_towels_12",
      fulfillerId: "fulfiller_a",
      sourceId: "aggregator_fixture",
      externalSku: "A-TOWEL-12",
      priceCents: 1499,
      taxCents: 0,
      deliveryDateUtc: "2026-10-21",
      freshUntilUtc: "2026-10-20T12:00:00.000Z",
      inStock: true,
      merchantScore: 0,
    });
    bindings.offers.upsertNormalized({
      canonicalItemId: "item_towels_12",
      fulfillerId: "fulfiller_b",
      sourceId: "aggregator_fixture",
      externalSku: "B-TOWEL-12",
      priceCents: 1199,
      taxCents: 0,
      deliveryDateUtc: "2026-10-21",
      freshUntilUtc: "2026-10-20T12:00:00.000Z",
      inStock: true,
      merchantScore: 0,
    });

    const second = await app.fetch(
      new Request("http://localhost/v1/list/reorder", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({
          list_line_id: line.line_id,
          qty: 1,
          deliver_by: "2026-10-22",
        }),
      }),
      bindings,
    );
    expect(second.status).toBe(201);
    const q2 = (await second.json()) as {
      fulfiller_id: string;
      landed_cents: number;
    };
    expect(q2.fulfiller_id).toBe("fulfiller_b");
    expect(q2.landed_cents).toBe(1199);

    const list = await app.fetch(
      new Request("http://localhost/v1/list", {
        headers: { Authorization: `Bearer ${agent.secret}` },
      }),
      bindings,
    );
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as {
      lines: Array<{ last_quote_id: string; last_order_id: string | null }>;
    };
    expect(listBody.lines[0]?.last_quote_id).toBeTruthy();
  });

  it("sensor payload on reorder is rejected by schema", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { household, mandate, agent } =
      await seedHouseholdWithMandateAndAgent(bindings);

    const upsert = await app.fetch(
      new Request(
        `http://localhost/v1/households/${household.householdId}/list`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mandate_id: mandate.mandateId,
            canonical_item_id: "item_towels_12",
          }),
        },
      ),
      bindings,
    );
    const line = (await upsert.json()) as { line_id: string };

    const bad = await app.fetch(
      new Request("http://localhost/v1/list/reorder", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({
          list_line_id: line.line_id,
          qty: 1,
          deliver_by: "2026-10-22",
          sensor: { empty: true },
        }),
      }),
      bindings,
    );
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "invalid_body" });
  });

  it("skip sets the line paused and does not place", async () => {
    const bindings = testBindings();
    const app = createApp();
    const fulfill = bindings.fulfill as FakeFulfillAdapter;
    const { household, mandate, agent } =
      await seedHouseholdWithMandateAndAgent(bindings);

    const upsert = await app.fetch(
      new Request(
        `http://localhost/v1/households/${household.householdId}/list`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mandate_id: mandate.mandateId,
            canonical_item_id: "item_towels_12",
          }),
        },
      ),
      bindings,
    );
    const line = (await upsert.json()) as { line_id: string };
    const placesBefore = fulfill.jobs.length;

    const skip = await app.fetch(
      new Request("http://localhost/v1/list/skip", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({ list_line_id: line.line_id }),
      }),
      bindings,
    );
    expect(skip.status).toBe(200);
    expect(await skip.json()).toMatchObject({
      line_id: line.line_id,
      mode: "pause",
      paused: true,
      next_due_at: null,
      snoozed_until: null,
    });
    expect(fulfill.jobs.length).toBe(placesBefore);
    expect(await bindings.orders.count()).toBe(0);

    const reorder = await app.fetch(
      new Request("http://localhost/v1/list/reorder", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({
          list_line_id: line.line_id,
          qty: 1,
          deliver_by: "2026-10-22",
        }),
      }),
      bindings,
    );
    expect(reorder.status).toBe(403);
  });

  it("two agents reordering the same line hit the household hold", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { household, mandate, agent } =
      await seedHouseholdWithMandateAndAgent(bindings);

    const agent2 = await bindings.agents.issue({
      householdId: household.householdId,
      scopes: ["quote", "commit", "read_list"],
      mandateIds: [mandate.mandateId],
    });

    const upsert = await app.fetch(
      new Request(
        `http://localhost/v1/households/${household.householdId}/list`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mandate_id: mandate.mandateId,
            canonical_item_id: "item_towels_12",
          }),
        },
      ),
      bindings,
    );
    const line = (await upsert.json()) as { line_id: string };

    const first = await app.fetch(
      new Request("http://localhost/v1/list/reorder", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({
          list_line_id: line.line_id,
          qty: 1,
          deliver_by: "2026-10-22",
        }),
      }),
      bindings,
    );
    expect(first.status).toBe(201);
    const q1 = (await first.json()) as { quote_id: string };

    const second = await app.fetch(
      new Request("http://localhost/v1/list/reorder", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent2.secret}`,
        },
        body: JSON.stringify({
          list_line_id: line.line_id,
          qty: 1,
          deliver_by: "2026-10-22",
        }),
      }),
      bindings,
    );
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({
      error: "hold_active",
      quote_id: q1.quote_id,
    });
  });
});

describe("Phase 5 framework exit", () => {
  it("list line reorders at a new price when second fulfiller is cheaper; household sees both", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { household, member, mandate, agent } =
      await seedHouseholdWithMandateAndAgent(bindings);

    await app.fetch(
      new Request(
        `http://localhost/v1/households/${household.householdId}/list`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mandate_id: mandate.mandateId,
            canonical_item_id: "item_towels_12",
            cadence_hint_days: 14,
          }),
        },
      ),
      bindings,
    );
    const listBefore = await app.fetch(
      new Request("http://localhost/v1/list", {
        headers: { Authorization: `Bearer ${agent.secret}` },
      }),
      bindings,
    );
    const before = (await listBefore.json()) as {
      lines: Array<{ line_id: string }>;
    };
    const lineId = before.lines[0]!.line_id;

    const r1 = await app.fetch(
      new Request("http://localhost/v1/list/reorder", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({
          list_line_id: lineId,
          qty: 1,
          deliver_by: "2026-10-22",
        }),
      }),
      bindings,
    );
    const q1 = (await r1.json()) as { quote_id: string; fulfiller_id: string };
    const c1 = await app.fetch(
      new Request("http://localhost/v1/commits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
          "Idempotency-Key": "idem_p5_exit_1",
        },
        body: JSON.stringify({
          quote_id: q1.quote_id,
          ...defaultCommitEvidence,
        }),
      }),
      bindings,
    );
    const order1 = (await c1.json()) as {
      receipt_token: string;
      order_id: string;
    };

    bindings.offers.upsertNormalized({
      canonicalItemId: "item_towels_12",
      fulfillerId: "fulfiller_a",
      sourceId: "aggregator_fixture",
      externalSku: "A-TOWEL-12",
      priceCents: 1600,
      taxCents: 0,
      deliveryDateUtc: "2026-10-21",
      freshUntilUtc: "2026-10-20T12:00:00.000Z",
      inStock: true,
      merchantScore: 0,
    });
    bindings.offers.upsertNormalized({
      canonicalItemId: "item_towels_12",
      fulfillerId: "fulfiller_b",
      sourceId: "aggregator_fixture",
      externalSku: "B-TOWEL-12",
      priceCents: 1100,
      taxCents: 0,
      deliveryDateUtc: "2026-10-21",
      freshUntilUtc: "2026-10-20T12:00:00.000Z",
      inStock: true,
      merchantScore: 0,
    });

    const r2 = await app.fetch(
      new Request("http://localhost/v1/list/reorder", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({
          list_line_id: lineId,
          qty: 1,
          deliver_by: "2026-10-22",
        }),
      }),
      bindings,
    );
    const q2 = (await r2.json()) as {
      quote_id: string;
      fulfiller_id: string;
      landed_cents: number;
    };
    expect(q2.fulfiller_id).toBe("fulfiller_b");
    expect(q2.landed_cents).toBe(1100);

    const c2 = await app.fetch(
      new Request("http://localhost/v1/commits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
          "Idempotency-Key": "idem_p5_exit_2",
        },
        body: JSON.stringify({
          quote_id: q2.quote_id,
          ...defaultCommitEvidence,
        }),
      }),
      bindings,
    );
    const order2 = (await c2.json()) as { receipt_token: string };

    const rec1 = await app.fetch(
      new Request(`http://localhost/v1/receipts/${order1.receipt_token}`, {
        headers: {
          "X-Cutoff-Member-Id": member.memberId,
          "X-Cutoff-Member-Household-Id": household.householdId,
        },
      }),
      bindings,
    );
    const rec2 = await app.fetch(
      new Request(`http://localhost/v1/receipts/${order2.receipt_token}`, {
        headers: {
          "X-Cutoff-Member-Id": member.memberId,
          "X-Cutoff-Member-Household-Id": household.householdId,
        },
      }),
      bindings,
    );
    expect(rec1.status).toBe(200);
    expect(rec2.status).toBe(200);
    const b1 = (await rec1.json()) as { fulfiller_id: string };
    const b2 = (await rec2.json()) as { fulfiller_id: string };
    expect(b1.fulfiller_id).toBe("fulfiller_a");
    expect(b2.fulfiller_id).toBe("fulfiller_b");
  });
});
