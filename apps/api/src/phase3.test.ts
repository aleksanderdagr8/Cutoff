import { describe, expect, it } from "vitest";
import { FakePayAdapter } from "@cutoff/adapters";
import { DEFAULT_VELOCITY_CAP_PER_HOUR } from "@cutoff/domain";
import { createApp } from "./app.js";
import {
  defaultCommitEvidence,
  seedHouseholdWithMandateAndAgent,
  testBindings,
} from "./test-helpers.js";

async function quoteAndCommit(
  app: ReturnType<typeof createApp>,
  bindings: ReturnType<typeof testBindings>,
  opts: {
    mandateId: string;
    secret: string;
    idempotencyKey: string;
    itemId?: string;
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
        canonical_item_id: opts.itemId ?? "item_towels_12",
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

describe("Phase 3 exit — risk / commit / pay", () => {
  it("second commit with the same key does not double-charge", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);
    const pay = bindings.pay as FakePayAdapter;

    const { quote, commitRes: first } = await quoteAndCommit(app, bindings, {
      mandateId: mandate.mandateId,
      secret: agent.secret,
      idempotencyKey: "idem_phase3_dup",
    });
    expect(first.status).toBe(201);
    const firstJson = (await first.json()) as {
      order_id: string;
      created: boolean;
      status: string;
      evidence_id: string;
    };
    expect(firstJson.created).toBe(true);
    // Phase 4 places after capture → status is placed when fulfill succeeds.
    expect(firstJson.status).toBe("placed");
    expect(firstJson.evidence_id).toBeTruthy();

    const second = await app.fetch(
      new Request("http://localhost/v1/commits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
          "Idempotency-Key": "idem_phase3_dup",
        },
        body: JSON.stringify({
          quote_id: quote.quote_id,
          ...defaultCommitEvidence,
        }),
      }),
      bindings,
    );
    expect(second.status).toBe(200);
    const secondJson = (await second.json()) as {
      order_id: string;
      created: boolean;
    };
    expect(secondJson.order_id).toBe(firstJson.order_id);
    expect(secondJson.created).toBe(false);
    expect(pay.charges).toHaveLength(1);
    expect(bindings.orders.chargeCount()).toBe(1);
    expect(bindings.orders.count()).toBe(1);
  });

  it("commit over ceiling returns mandate_miss and captures nothing", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { household, mandate, agent } =
      await seedHouseholdWithMandateAndAgent(bindings, { ceilingCents: 2000 });
    const pay = bindings.pay as FakePayAdapter;

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

    // Human lowers ceiling below the frozen quote landed price.
    const lower = await app.fetch(
      new Request(
        `http://localhost/v1/households/${household.householdId}/mandates/${mandate.mandateId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ceiling_cents: 500 }),
        },
      ),
      bindings,
    );
    expect(lower.status).toBe(200);

    const commit = await app.fetch(
      new Request("http://localhost/v1/commits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
          "Idempotency-Key": "idem_over_ceiling",
        },
        body: JSON.stringify({
          quote_id: quote.quote_id,
          ...defaultCommitEvidence,
        }),
      }),
      bindings,
    );
    expect(commit.status).toBe(403);
    expect(await commit.json()).toEqual({ error: "mandate_miss" });
    expect(pay.charges).toHaveLength(0);
    expect(bindings.orders.chargeCount()).toBe(0);
    expect(bindings.orders.count()).toBe(0);
  });
});

describe("U7 risk gate", () => {
  it("kill switch returns kill_switch and does not call pay", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);
    const pay = bindings.pay as FakePayAdapter;

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

    bindings.risk.setKillSwitch(true);

    const commit = await app.fetch(
      new Request("http://localhost/v1/commits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
          "Idempotency-Key": "idem_kill",
        },
        body: JSON.stringify({
          quote_id: quote.quote_id,
          ...defaultCommitEvidence,
        }),
      }),
      bindings,
    );
    expect(commit.status).toBe(403);
    expect(await commit.json()).toEqual({ error: "kill_switch" });
    expect(pay.attempts).toHaveLength(0);
    expect(pay.charges).toHaveLength(0);
  });

  it("new address returns mandate_miss", async () => {
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
    const quote = (await quoteRes.json()) as { quote_id: string };
    const row = bindings.quotes.get(quote.quote_id)!;
    row.addressId = "addr_not_on_mandate";

    const commit = await app.fetch(
      new Request("http://localhost/v1/commits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
          "Idempotency-Key": "idem_new_addr",
        },
        body: JSON.stringify({
          quote_id: quote.quote_id,
          ...defaultCommitEvidence,
        }),
      }),
      bindings,
    );
    expect(commit.status).toBe(403);
    expect(await commit.json()).toEqual({ error: "mandate_miss" });
    expect((bindings.pay as FakePayAdapter).charges).toHaveLength(0);
  });

  it("eleventh commit in an hour over the velocity cap fails", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);
    const pay = bindings.pay as FakePayAdapter;

    for (let i = 0; i < DEFAULT_VELOCITY_CAP_PER_HOUR; i += 1) {
      const { commitRes } = await quoteAndCommit(app, bindings, {
        mandateId: mandate.mandateId,
        secret: agent.secret,
        idempotencyKey: `idem_vel_${i}`,
      });
      expect(commitRes.status).toBe(201);
    }
    expect(pay.charges).toHaveLength(DEFAULT_VELOCITY_CAP_PER_HOUR);

    const blocked = await quoteAndCommit(app, bindings, {
      mandateId: mandate.mandateId,
      secret: agent.secret,
      idempotencyKey: "idem_vel_11",
    });
    expect(blocked.commitRes.status).toBe(403);
    expect(await blocked.commitRes.json()).toEqual({ error: "mandate_miss" });
    expect(pay.charges).toHaveLength(DEFAULT_VELOCITY_CAP_PER_HOUR);
  });
});

describe("U8 commit and pay", () => {
  it("amount sent to the adapter is the quote amount; mutated body does not raise it", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);
    const pay = bindings.pay as FakePayAdapter;

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
    const quote = (await quoteRes.json()) as {
      quote_id: string;
      landed_cents: number;
    };

    const commit = await app.fetch(
      new Request("http://localhost/v1/commits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
          "Idempotency-Key": "idem_amount",
        },
        body: JSON.stringify({
          quote_id: quote.quote_id,
          amount_cents: 999_999,
          ...defaultCommitEvidence,
        }),
      }),
      bindings,
    );
    // Unknown field rejected by strict schema — or if stripped, charge stays quote.
    // Strict zod → invalid_body. Re-try without extra field after proving strictness.
    expect(commit.status).toBe(400);

    const ok = await app.fetch(
      new Request("http://localhost/v1/commits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
          "Idempotency-Key": "idem_amount_ok",
        },
        body: JSON.stringify({
          quote_id: quote.quote_id,
          ...defaultCommitEvidence,
        }),
      }),
      bindings,
    );
    expect(ok.status).toBe(201);
    expect(pay.attempts[0]?.amountCents).toBe(quote.landed_cents);
    expect(pay.charges[0]?.amountCents).toBe(quote.landed_cents);
  });

  it("adapter error writes failed and no captured", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);
    const pay = bindings.pay as FakePayAdapter;
    pay.failNext = true;

    const { commitRes } = await quoteAndCommit(app, bindings, {
      mandateId: mandate.mandateId,
      secret: agent.secret,
      idempotencyKey: "idem_pay_fail",
    });
    expect(commitRes.status).toBe(201);
    const json = (await commitRes.json()) as {
      order_id: string;
      status: string;
    };
    expect(json.status).toBe("failed");
    expect(pay.charges).toHaveLength(0);
    expect(bindings.orders.chargeCount()).toBe(0);

    const events = bindings.orders.listEvents(json.order_id);
    expect(events.map((e) => e.status)).toEqual(["committed", "failed"]);
    expect(events.some((e) => e.status === "captured")).toBe(false);
  });

  it("actor chain and protocol are on the evidence row; missing actor fails", async () => {
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
    const quote = (await quoteRes.json()) as { quote_id: string };

    const missing = await app.fetch(
      new Request("http://localhost/v1/commits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
          "Idempotency-Key": "idem_no_actor",
        },
        body: JSON.stringify({
          quote_id: quote.quote_id,
          actor_chain: [],
          protocol: "cutoff.v1",
        }),
      }),
      bindings,
    );
    expect(missing.status).toBe(400);

    const ok = await app.fetch(
      new Request("http://localhost/v1/commits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
          "Idempotency-Key": "idem_evidence",
        },
        body: JSON.stringify({
          quote_id: quote.quote_id,
          actor_chain: ["buyer_agent", "household"],
          protocol: "cutoff.v1",
        }),
      }),
      bindings,
    );
    expect(ok.status).toBe(201);
    const json = (await ok.json()) as {
      order_id: string;
      evidence_id: string;
    };
    const evidence = bindings.orders.getEvidence(json.order_id);
    expect(evidence).not.toBeNull();
    expect(evidence!.actorChain).toEqual(["buyer_agent", "household"]);
    expect(evidence!.protocol).toBe("cutoff.v1");
    expect(evidence!.agentKeyId).toBe(agent.keyId);
    expect(evidence!.mandateId).toBe(mandate.mandateId);
    expect(evidence!.quoteHash.length).toBeGreaterThan(10);
    expect(evidence!.amountCents).toBe(1299);
  });
});
