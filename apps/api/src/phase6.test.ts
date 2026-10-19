import { describe, expect, it } from "vitest";
import {
  FakeBrandFeedOfferAdapter,
  FakePayAdapter,
  signOutboundWebhook,
} from "@cutoff/adapters";
import { createApp } from "./app.js";
import {
  defaultCommitEvidence,
  seedHouseholdWithMandateAndAgent,
  testBindings,
  TEST_WEBHOOK_SECRET,
} from "./test-helpers.js";

async function quote(
  app: ReturnType<typeof createApp>,
  bindings: ReturnType<typeof testBindings>,
  opts: { mandateId: string; secret: string; itemId?: string },
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
        canonical_item_id: opts.itemId ?? "item_towels_12",
        qty: 1,
        deliver_by: "2026-10-22",
      }),
    }),
    bindings,
  );
  return res;
}

async function quoteAndCommit(
  app: ReturnType<typeof createApp>,
  bindings: ReturnType<typeof testBindings>,
  opts: {
    mandateId: string;
    secret: string;
    idempotencyKey: string;
  },
) {
  const quoteRes = await quote(app, bindings, opts);
  expect(quoteRes.status).toBe(201);
  const q = (await quoteRes.json()) as {
    quote_id: string;
    fulfiller_id: string;
    landed_cents: number;
    score_inputs: {
      landed_cents: number;
      delivery_date: string;
      merchant_score: number;
    };
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
        quote_id: q.quote_id,
        ...defaultCommitEvidence,
      }),
    }),
    bindings,
  );
  return { quote: q, commitRes };
}

describe("Phase 6 — Unit 12 score and second source", () => {
  it("equal price, worse on-time, loses", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);

    // Equal landed for A and B; brand stays higher.
    for (const row of bindings.offers.listForItem("item_towels_12")) {
      if (row.fulfillerId === "fulfiller_a" || row.fulfillerId === "fulfiller_b") {
        bindings.offers.upsertNormalized({
          ...row,
          priceCents: 1299,
          taxCents: 0,
        });
      }
    }

    bindings.risk.recordScoreEvent({
      fulfillerId: "fulfiller_a",
      kind: "late",
      orderId: null,
      atUtc: bindings.nowUtc(),
      actorId: "system.test",
    });
    bindings.risk.recordScoreEvent({
      fulfillerId: "fulfiller_b",
      kind: "on_time",
      orderId: null,
      atUtc: bindings.nowUtc(),
      actorId: "system.test",
    });

    const res = await quote(app, bindings, {
      mandateId: mandate.mandateId,
      secret: agent.secret,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      fulfiller_id: string;
      score_inputs: { merchant_score: number; landed_cents: number };
    };
    expect(body.fulfiller_id).toBe("fulfiller_b");
    expect(body.score_inputs.landed_cents).toBe(1299);
    expect(body.score_inputs.merchant_score).toBe(1);
    expect(bindings.risk.merchantScore("fulfiller_a")).toBe(-1);
  });

  it("original aggregator seller loses to cheaper brand feed; quote shows why", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings, {
      ceilingCents: 2500,
    });

    // Brand undercuts aggregator A (1299) and B (1499).
    const brand = bindings.offers
      .listForItem("item_towels_12")
      .find((o) => o.fulfillerId === "fulfiller_brand");
    expect(brand).toBeTruthy();
    bindings.offers.upsertNormalized({
      ...brand!,
      priceCents: 1199,
      taxCents: 0,
    });

    const { quote: q, commitRes } = await quoteAndCommit(app, bindings, {
      mandateId: mandate.mandateId,
      secret: agent.secret,
      idempotencyKey: "idem_p6_brand_wins",
    });
    expect(commitRes.status).toBe(201);
    const commit = (await commitRes.json()) as { order_id: string };

    expect(q.fulfiller_id).toBe("fulfiller_brand");
    expect(q.fulfiller_id).not.toBe("fulfiller_a");
    expect(q.landed_cents).toBe(1199);
    expect(q.score_inputs.landed_cents).toBe(1199);
    expect(q.score_inputs.merchant_score).toBe(0);

    // Order exists for the brand winner — exit criterion.
    const order = bindings.orders.get(commit.order_id);
    expect(order).not.toBeNull();
    expect(bindings.quotes.get(order!.quoteId)?.fulfillerId).toBe(
      "fulfiller_brand",
    );
  });

  it("exported pack contains actor chain, quote hash, amount, fulfiller, rank inputs", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);

    const { quote: q, commitRes } = await quoteAndCommit(app, bindings, {
      mandateId: mandate.mandateId,
      secret: agent.secret,
      idempotencyKey: "idem_p6_evidence",
    });
    expect(commitRes.status).toBe(201);
    const commit = (await commitRes.json()) as {
      order_id: string;
      evidence_id: string;
    };

    const packRes = await app.fetch(
      new Request(`http://localhost/v1/orders/${commit.order_id}/evidence`, {
        headers: { Authorization: `Bearer ${agent.secret}` },
      }),
      bindings,
    );
    expect(packRes.status).toBe(200);
    const pack = (await packRes.json()) as {
      order_id: string;
      evidence_id: string;
      actor_chain: string[];
      quote_hash: string;
      amount_cents: number;
      fulfiller_id: string;
      rank_inputs: {
        landed_cents: number;
        delivery_date: string;
        merchant_score: number;
      };
    };
    expect(pack.order_id).toBe(commit.order_id);
    expect(pack.evidence_id).toBe(commit.evidence_id);
    expect(pack.actor_chain).toEqual(["buyer_agent", "cutoff"]);
    expect(pack.quote_hash.length).toBeGreaterThan(10);
    expect(pack.amount_cents).toBe(q.landed_cents);
    expect(pack.fulfiller_id).toBe(q.fulfiller_id);
    expect(pack.rank_inputs.landed_cents).toBe(q.score_inputs.landed_cents);
    expect(pack.rank_inputs.delivery_date).toBe(q.score_inputs.delivery_date);
    expect(pack.rank_inputs.merchant_score).toBe(q.score_inputs.merchant_score);
  });

  it("suspending a merchant removes its offers from the next quote", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);

    // Baseline: cheaper A wins.
    const before = await quote(app, bindings, {
      mandateId: mandate.mandateId,
      secret: agent.secret,
    });
    expect(before.status).toBe(201);
    expect(((await before.json()) as { fulfiller_id: string }).fulfiller_id).toBe(
      "fulfiller_a",
    );

    bindings.risk.suspendMerchant("fulfiller_a", {
      actorId: "ops_phase6",
      atUtc: bindings.nowUtc(),
    });
    expect(bindings.risk.listAudits().some((a) => a.action === "merchant_suspend")).toBe(
      true,
    );

    // Hold from first quote — release by marking committed or use fresh household.
    // Clear hold by creating a new agent/mandate household for the suspend check.
    const second = await seedHouseholdWithMandateAndAgent(bindings);
    const after = await quote(app, bindings, {
      mandateId: second.mandate.mandateId,
      secret: second.agent.secret,
    });
    expect(after.status).toBe(201);
    const body = (await after.json()) as { fulfiller_id: string };
    expect(body.fulfiller_id).not.toBe("fulfiller_a");
    // Next-cheapest among remaining: brand at 1399 beats B at 1499.
    expect(body.fulfiller_id).toBe("fulfiller_brand");
  });

  it("kill switch returns kill_switch and does not call pay (drill)", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);

    const quoteRes = await quote(app, bindings, {
      mandateId: mandate.mandateId,
      secret: agent.secret,
    });
    expect(quoteRes.status).toBe(201);
    const q = (await quoteRes.json()) as { quote_id: string };

    bindings.risk.setKillSwitch(true, {
      actorId: "ops_phase6",
      atUtc: bindings.nowUtc(),
    });
    expect(
      bindings.risk.listAudits().some((a) => a.action === "kill_switch_on"),
    ).toBe(true);

    const pay = bindings.pay as FakePayAdapter;
    const payBefore = pay.charges.length;
    const commitRes = await app.fetch(
      new Request("http://localhost/v1/commits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
          "Idempotency-Key": "idem_p6_kill",
        },
        body: JSON.stringify({
          quote_id: q.quote_id,
          ...defaultCommitEvidence,
        }),
      }),
      bindings,
    );
    expect(commitRes.status).toBe(403);
    expect(await commitRes.json()).toEqual({ error: "kill_switch" });
    expect(pay.charges.length).toBe(payBefore);
  });

  it("brand feed adapter covers top items only", async () => {
    const feed = new FakeBrandFeedOfferAdapter(
      [
        {
          externalSku: "BRAND-TOWEL-12",
          gtin: "000111222333",
          packCount: 12,
          priceCents: 1199,
          taxCents: 0,
          deliveryDateUtc: "2026-10-21",
          freshUntilUtc: "2026-10-20T00:00:00.000Z",
          inStock: true,
          fulfillerId: "fulfiller_brand",
        },
        {
          externalSku: "BRAND-KIBBLE",
          gtin: "999888777666",
          packCount: 5,
          priceCents: 2000,
          taxCents: 0,
          deliveryDateUtc: "2026-10-21",
          freshUntilUtc: "2026-10-20T00:00:00.000Z",
          inStock: true,
          fulfillerId: "fulfiller_brand",
        },
      ],
      { allowedGtins: ["000111222333"] },
    );
    const result = await feed.fetchOffers();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sourceId).toBe("brand_feed_fixture");
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.externalSku).toBe("BRAND-TOWEL-12");
    }
  });

  it("on-time delivery writes merchant_scores from events", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);

    const { commitRes } = await quoteAndCommit(app, bindings, {
      mandateId: mandate.mandateId,
      secret: agent.secret,
      idempotencyKey: "idem_p6_ontime",
    });
    const commit = (await commitRes.json()) as {
      order_id: string;
      job_id: string;
    };
    const quoteRow = bindings.quotes.get(
      bindings.orders.get(commit.order_id)!.quoteId,
    )!;

    const body = JSON.stringify({
      event_id: "evt_p6_delivered",
      order_id: commit.order_id,
      job_id: commit.job_id,
      status: "delivered",
      tracking_number: "TRK1",
      occurred_at: "2026-10-19T12:00:00.000Z",
    });
    const headers = await signOutboundWebhook(
      TEST_WEBHOOK_SECRET,
      Math.floor(Date.parse("2026-10-19T12:00:00.000Z") / 1000),
      body,
    );
    const wh = await app.fetch(
      new Request("http://localhost/v1/webhooks/fulfill", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body,
      }),
      bindings,
    );
    expect(wh.status).toBe(201);
    expect(bindings.risk.merchantScore(quoteRow.fulfillerId)).toBe(1);
    expect(
      bindings.risk.listScoreEvents(quoteRow.fulfillerId).some(
        (e) => e.kind === "on_time",
      ),
    ).toBe(true);
  });
});
