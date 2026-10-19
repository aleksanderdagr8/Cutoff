import { describe, expect, it } from "vitest";
import { FakePayAdapter } from "@cutoff/adapters";
import { MemoryAgentCredentialRepository } from "./agents.js";
import { MemoryHouseholdRepository } from "./households.js";
import { MemoryRevocationKv } from "./kv.js";
import { MemoryMandateRepository } from "./mandates.js";
import { MemoryOrderRepository } from "./orders.js";

describe("U1 MemoryHouseholdRepository", () => {
  it("member A cannot read household B", () => {
    const repo = new MemoryHouseholdRepository();
    const a = repo.createHousehold("A", "a@example.com");
    const b = repo.createHousehold("B", "b@example.com");

    expect(
      repo.getHousehold(
        {
          role: "member",
          memberId: a.member.memberId,
          householdId: a.household.householdId,
        },
        b.household.householdId,
      ),
    ).toBeNull();

    expect(
      repo.getHousehold(
        {
          role: "member",
          memberId: a.member.memberId,
          householdId: a.household.householdId,
        },
        a.household.householdId,
      ),
    ).not.toBeNull();
  });

  it("anon cannot insert an order; service role can", () => {
    const repo = new MemoryHouseholdRepository();
    expect(
      repo.tryInsertOrder(
        { role: "anon" },
        { householdId: "hh", amountCents: 1 },
      ),
    ).toEqual({ ok: false, error: "unauthenticated" });
    expect(
      repo.tryInsertOrder(
        { role: "service_role" },
        { householdId: "hh", amountCents: 1 },
      ),
    ).toEqual({ ok: true });
  });

  it("accepts stable household/member ids for demo seed", () => {
    const repo = new MemoryHouseholdRepository();
    const { household, member } = repo.createHousehold(
      "Demo Home",
      "member@cutoff.local",
      {
        householdId: "01DEMOHOMEHOUSEHOLD00000001",
        memberId: "01DEMOHOMEMEMBER0000000001",
      },
    );
    expect(household.householdId).toBe("01DEMOHOMEHOUSEHOLD00000001");
    expect(member.memberId).toBe("01DEMOHOMEMEMBER0000000001");
    expect(repo.memberOf(member.memberId, household.householdId)).toBe(true);
  });
});

describe("U2 MemoryAgentCredentialRepository", () => {
  it("stores hash only and revoke fans out to KV", async () => {
    const kv = new MemoryRevocationKv();
    const agents = new MemoryAgentCredentialRepository(kv);
    const issued = await agents.issue({
      householdId: "hh_1",
      scopes: ["quote", "commit"],
      mandateIds: ["m_1"],
    });

    expect(issued.secret.startsWith("ck_live_")).toBe(true);
    expect(agents.storedHashes()).not.toContain(issued.secret);
    expect(agents.selectByKeyId(issued.keyId)?.secretHash).not.toBe(
      issued.secret,
    );

    await agents.revoke(issued.keyId);
    expect(await kv.isRevoked(issued.keyId)).toBe(true);
    expect(await agents.authenticate(issued.secret)).toEqual({
      ok: false,
      error: "revoked",
    });
  });
});

describe("U3 mandate commit", () => {
  it("over ceiling writes no charge", async () => {
    const pay = new FakePayAdapter();
    const orders = new MemoryOrderRepository(pay);
    const mandates = new MemoryMandateRepository();
    const mandate = mandates.create({
      householdId: "hh_1",
      ceilingCents: 500,
      expiresAtUtc: "2026-12-01T00:00:00.000Z",
      canonicalItemIds: ["item_towels_12"],
      addressId: "addr_home",
    });

    const result = await orders.commitWithMandate({
      householdId: "hh_1",
      canonicalItemId: "item_towels_12",
      quoteId: "qt_1",
      amountCents: 501,
      idempotencyKey: "idem_1",
      mandate: mandates.toSnapshot(mandate),
      addressId: "addr_home",
      nowUtc: "2026-10-19T00:00:00.000Z",
    });

    expect(result).toEqual({ ok: false, error: "mandate_miss" });
    expect(pay.charges).toHaveLength(0);
    expect(orders.count()).toBe(0);
  });
});
