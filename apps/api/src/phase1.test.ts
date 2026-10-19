import { describe, expect, it } from "vitest";
import { FakePayAdapter } from "@cutoff/adapters";
import { createApp } from "./app.js";
import {
  defaultCommitEvidence,
  seedHouseholdWithMandateAndAgent,
  testBindings,
} from "./test-helpers.js";

const quoteBody = {
  mandate_id: "", // filled per test
  canonical_item_id: "item_towels_12",
  qty: 1,
  deliver_by: "2026-10-20",
};

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

    const body = { ...quoteBody, mandate_id: mandate.mandateId };

    const ok = await app.fetch(
      new Request("http://localhost/v1/quotes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify(body),
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
        body: JSON.stringify(body),
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

    // Fixture towels_12 cheaper offer is 1299 > ceiling 1000 → over_ceiling
    const quoteRes = await app.fetch(
      new Request("http://localhost/v1/quotes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
        },
        body: JSON.stringify({
          ...quoteBody,
          mandate_id: mandate.mandateId,
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
          ...quoteBody,
          mandate_id: mandate.mandateId,
          deliver_by: "2026-12-03",
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
          ...quoteBody,
          mandate_id: mandate.mandateId,
        }),
      }),
      bindings,
    );
    expect(before.status).toBe(201);
    const beforeJson = (await before.json()) as {
      ceiling_cents: number;
      landed_cents: number;
      quote_id: string;
    };
    expect(beforeJson.ceiling_cents).toBe(2000);
    expect(beforeJson.landed_cents).toBe(1299);

    // Release hold by committing so the next quote can run after ceiling drop.
    const commit = await app.fetch(
      new Request("http://localhost/v1/commits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${agent.secret}`,
          "Idempotency-Key": "idem_lower_ceiling",
        },
        body: JSON.stringify({
          quote_id: beforeJson.quote_id,
          ...defaultCommitEvidence,
        }),
      }),
      bindings,
    );
    expect(commit.status).toBe(201);

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
          ...quoteBody,
          mandate_id: mandate.mandateId,
        }),
      }),
      bindings,
    );
    expect(after.status).toBe(403);
    expect(await after.json()).toEqual({ error: "over_ceiling" });
  });
});
