import { describe, expect, it } from "vitest";
import { FakePayAdapter } from "@cutoff/adapters";
import { createApp } from "./app.js";
import {
  seedHouseholdWithMandateAndAgent,
  testBindings,
} from "./test-helpers.js";

describe("U1 household RLS", () => {
  it("member A cannot read household B", async () => {
    const bindings = testBindings();
    const app = createApp();

    const a = bindings.households.createHousehold("Home A", "a@example.com");
    const b = bindings.households.createHousehold("Home B", "b@example.com");

    const res = await app.fetch(
      new Request(`http://localhost/v1/households/${b.household.householdId}`, {
        headers: {
          "X-Cutoff-Member-Id": a.member.memberId,
          "X-Cutoff-Member-Household-Id": a.household.householdId,
        },
      }),
      bindings,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });

  it("anon key cannot insert an order", () => {
    const bindings = testBindings();
    const result = bindings.households.tryInsertOrder(
      { role: "anon" },
      { householdId: "hh_x", amountCents: 100 },
    );
    expect(result).toEqual({ ok: false, error: "unauthenticated" });
    expect(bindings.households.orderInsertCount()).toBe(0);

    const service = bindings.households.tryInsertOrder(
      { role: "service_role" },
      { householdId: "hh_x", amountCents: 100 },
    );
    expect(service).toEqual({ ok: true });
    expect(bindings.households.orderInsertCount()).toBe(1);
  });
});

describe("U2 agent credential", () => {
  it("revoked key receives revoked on the next call", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { household, mandate, agent } =
      await seedHouseholdWithMandateAndAgent(bindings);

    const quoteBody = {
      mandate_id: mandate.mandateId,
      canonical_item_id: "item_towels_12",
      qty: 1,
      deliver_by: "2026-10-20",
      amount_cents: 1299,
    };

    const ok = await app.fetch(
      new Request("http://localhost/v1/quotes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify(quoteBody),
      }),
      bindings,
    );
    expect(ok.status).toBe(201);

    await app.fetch(
      new Request(
        `http://localhost/v1/households/${household.householdId}/agents/${agent.keyId}/revoke`,
        { method: "POST" },
      ),
      bindings,
    );

    const after = await app.fetch(
      new Request("http://localhost/v1/quotes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify(quoteBody),
      }),
      bindings,
    );
    expect(after.status).toBe(401);
    expect(await after.json()).toEqual({ error: "revoked" });
  });

  it("key for household A cannot read household B", async () => {
    const bindings = testBindings();
    const app = createApp();
    const a = await seedHouseholdWithMandateAndAgent(bindings);
    const b = bindings.households.createHousehold("Home B", "b@example.com");

    const res = await app.fetch(
      new Request(
        `http://localhost/v1/households/${b.household.householdId}`,
        {
          headers: { Authorization: `Bearer ${a.agent.secret}` },
        },
      ),
      bindings,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });

  it("secret is not in any log line or select", async () => {
    const bindings = testBindings();
    const { agent } = await seedHouseholdWithMandateAndAgent(bindings);

    // Force a select + authenticate path.
    bindings.agents.selectByKeyId(agent.keyId);
    await bindings.agents.authenticate(agent.secret);

    const haystack = [
      ...bindings.agents.selectLog,
      ...bindings.agents.structuredLogs,
    ].join("\n");
    expect(haystack).not.toContain(agent.secret);
    expect(haystack).not.toMatch(/ck_live_[0-9a-f]{48}/);
    expect(bindings.agents.storedHashes()).not.toContain(agent.secret);
  });

  it("KV miss still revokes via Postgres fallback", async () => {
    const bindings = testBindings();
    const { agent } = await seedHouseholdWithMandateAndAgent(bindings);
    await bindings.agents.revoke(agent.keyId);
    bindings.revocationKv.clearKey(agent.keyId);

    const result = await bindings.agents.authenticate(agent.secret);
    expect(result).toEqual({ ok: false, error: "revoked" });
  });
});

describe("U3 mandate", () => {
  it("commit over ceiling returns mandate_miss and writes no charge", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(
      bindings,
      { ceilingCents: 1000 },
    );

    // Quote at ceiling first, then human does not lower — instead we
    // construct a quote under ceiling and mutate mandate ceiling down
    // before commit, OR quote with amount under then raise amount via
    // direct commitWithMandate. Spec: commit over ceiling.
    // Use repository path with amount over ceiling.
    const pay = bindings.pay as FakePayAdapter;
    const result = await bindings.orders.commitWithMandate({
      householdId: "hh_direct",
      canonicalItemId: "item_towels_12",
      quoteId: "qt_over",
      amountCents: 1500,
      idempotencyKey: "idem_over",
      mandate: bindings.mandates.toSnapshot(mandate),
      addressId: "addr_home",
      nowUtc: bindings.nowUtc(),
    });
    expect(result).toEqual({ ok: false, error: "mandate_miss" });
    expect(pay.charges).toHaveLength(0);
    expect(bindings.orders.count()).toBe(0);

    // Also via HTTP: quote refuses over_ceiling before commit.
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
          deliver_by: "2026-10-20",
          amount_cents: 1500,
        }),
      }),
      bindings,
    );
    expect(quoteRes.status).toBe(403);
    expect(await quoteRes.json()).toEqual({ error: "over_ceiling" });
  });

  it("agent cannot add an address or raise the ceiling", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(bindings);

    const raise = await app.fetch(
      new Request(`http://localhost/v1/mandates/${mandate.mandateId}/widen`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({ raise_ceiling: true, ceiling_cents: 99999 }),
      }),
      bindings,
    );
    expect(raise.status).toBe(403);
    expect(await raise.json()).toEqual({ error: "mandate_miss" });

    const addr = await app.fetch(
      new Request(`http://localhost/v1/mandates/${mandate.mandateId}/widen`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({ add_address: true, address_id: "addr_2" }),
      }),
      bindings,
    );
    expect(addr.status).toBe(403);
    expect(await addr.json()).toEqual({ error: "mandate_miss" });

    const still = bindings.mandates.get(mandate.mandateId);
    expect(still?.ceilingCents).toBe(2000);
    expect(still?.addressId).toBe("addr_home");
  });

  it("expired mandate fails closed", async () => {
    const bindings = testBindings({
      nowUtc: () => "2026-12-02T00:00:00.000Z",
    });
    const app = createApp();
    const { mandate, agent } = await seedHouseholdWithMandateAndAgent(
      bindings,
      { expiresAt: "2026-12-01T00:00:00.000Z" },
    );

    const res = await app.fetch(
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
          deliver_by: "2026-12-03",
          amount_cents: 500,
        }),
      }),
      bindings,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "mandate_miss" });
  });

  it("human can lower the ceiling and the next quote sees it", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { household, mandate, agent } =
      await seedHouseholdWithMandateAndAgent(bindings, { ceilingCents: 2000 });

    const before = await app.fetch(
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
          deliver_by: "2026-10-20",
          amount_cents: 1800,
        }),
      }),
      bindings,
    );
    expect(before.status).toBe(201);
    const beforeJson = (await before.json()) as { ceiling_cents: number };
    expect(beforeJson.ceiling_cents).toBe(2000);

    const lower = await app.fetch(
      new Request(
        `http://localhost/v1/households/${household.householdId}/mandates/${mandate.mandateId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ceiling_cents: 1000 }),
        },
      ),
      bindings,
    );
    expect(lower.status).toBe(200);
    expect(await lower.json()).toEqual({
      mandate_id: mandate.mandateId,
      ceiling_cents: 1000,
    });

    const after = await app.fetch(
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
          deliver_by: "2026-10-20",
          amount_cents: 1800,
        }),
      }),
      bindings,
    );
    expect(after.status).toBe(403);
    expect(await after.json()).toEqual({ error: "over_ceiling" });

    const under = await app.fetch(
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
          deliver_by: "2026-10-20",
          amount_cents: 900,
        }),
      }),
      bindings,
    );
    expect(under.status).toBe(201);
    const underJson = (await under.json()) as { ceiling_cents: number };
    expect(underJson.ceiling_cents).toBe(1000);
  });
});
