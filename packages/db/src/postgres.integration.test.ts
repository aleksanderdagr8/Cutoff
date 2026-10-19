/**
 * Optional live integration against a Cutoff Supabase project.
 * Skipped unless SUPABASE_URL + SUPABASE_SERVICE_ROLE are set (CI stays green).
 *
 * Requires migrations applied. Inserts a household → mandate → agent round-trip.
 */
import { describe, expect, it } from "vitest";
import { FakePayAdapter } from "@cutoff/adapters";
import { createRepos } from "./create-repos.js";
import { hasSupabaseServiceEnv } from "./supabase-client.js";

const live = hasSupabaseServiceEnv();

describe.skipIf(!live)("Postgres repos (live env)", () => {
  it("creates household, mandate, and agent credential", async () => {
    const repos = createRepos({
      mode: "postgres",
      pay: new FakePayAdapter(),
      seedCatalogOffers: false,
    });

    const { household } = await repos.households.createHousehold(
      `integ_${Date.now()}`,
      `integ_${Date.now()}@example.com`,
    );

    const mandate = await repos.mandates.create({
      householdId: household.householdId,
      ceilingCents: 2500,
      expiresAtUtc: "2030-01-01T00:00:00.000Z",
      canonicalItemIds: ["item_towels_12"],
      addressId: "addr_home",
    });
    expect(mandate.mandateId).toBeTruthy();
    expect(mandate.ceilingCents).toBe(2500);

    const loaded = await repos.mandates.get(mandate.mandateId);
    expect(loaded?.canonicalItemIds).toContain("item_towels_12");

    const issued = await repos.agents.issue({
      householdId: household.householdId,
      scopes: ["quote", "commit"],
      mandateIds: [mandate.mandateId],
    });
    expect(issued.secret.startsWith("ck_live_")).toBe(true);

    const auth = await repos.agents.authenticate(issued.secret);
    expect(auth.ok).toBe(true);
    if (auth.ok) {
      expect(auth.agent.keyId).toBe(issued.keyId);
      expect(auth.agent.householdId).toBe(household.householdId);
    }

    await repos.agents.revoke(issued.keyId);
    const revoked = await repos.agents.authenticate(issued.secret);
    expect(revoked).toEqual({ ok: false, error: "revoked" });
  });
});
