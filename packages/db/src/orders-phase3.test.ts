import { describe, expect, it } from "vitest";
import { FakePayAdapter } from "@cutoff/adapters";
import { MemoryOrderRepository } from "./orders.js";

const mandate = {
  ceilingCents: 5000,
  expiresAtUtc: "2026-12-01T00:00:00.000Z",
  canonicalItemIds: ["item_towels_12"],
  categoryAllowList: [] as string[],
  neverSubstituteIds: [] as string[],
  addressId: "addr_home",
  actorCap: 4,
};

describe("MemoryOrderRepository evidence commit (U8)", () => {
  it("same idempotency key returns original order and one charge", async () => {
    const pay = new FakePayAdapter();
    const repo = new MemoryOrderRepository(pay);
    const input = {
      householdId: "hh_1",
      canonicalItemId: "item_towels_12",
      quoteId: "qt_1",
      amountCents: 1299,
      idempotencyKey: "idem_ev",
      mandate,
      addressId: "addr_home",
      nowUtc: "2026-10-19T12:00:00.000Z",
      actorChain: ["agent"],
      protocol: "cutoff.v1",
      agentKeyId: "key_1",
      mandateId: "man_1",
      quoteHashMaterial: "qt_1|1299|0|f_a|item_towels_12|2026-10-22",
    };

    const first = await repo.commitWithEvidence(input);
    const second = await repo.commitWithEvidence(input);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.created).toBe(false);
    expect(second.order.orderId).toBe(first.order.orderId);
    expect(pay.charges).toHaveLength(1);
    expect(repo.chargeCount()).toBe(1);
  });

  it("pay failure writes failed event and no charge", async () => {
    const pay = new FakePayAdapter();
    pay.failNext = true;
    const repo = new MemoryOrderRepository(pay);
    const result = await repo.commitWithEvidence({
      householdId: "hh_1",
      canonicalItemId: "item_towels_12",
      quoteId: "qt_2",
      amountCents: 1299,
      idempotencyKey: "idem_fail",
      mandate,
      addressId: "addr_home",
      nowUtc: "2026-10-19T12:00:00.000Z",
      actorChain: ["agent"],
      protocol: "cutoff.v1",
      agentKeyId: "key_1",
      mandateId: "man_1",
      quoteHashMaterial: "qt_2|1299|0|f_a|item_towels_12|2026-10-22",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.status).toBe("failed");
    expect(result.order.chargeId).toBeNull();
    expect(repo.listEvents(result.order.orderId).map((e) => e.status)).toEqual([
      "committed",
      "failed",
    ]);
    expect(repo.chargeCount()).toBe(0);
  });

  it("missing actor chain writes no charge", async () => {
    const pay = new FakePayAdapter();
    const repo = new MemoryOrderRepository(pay);
    const result = await repo.commitWithEvidence({
      householdId: "hh_1",
      canonicalItemId: "item_towels_12",
      quoteId: "qt_3",
      amountCents: 1299,
      idempotencyKey: "idem_no_actor",
      mandate,
      addressId: "addr_home",
      nowUtc: "2026-10-19T12:00:00.000Z",
      actorChain: [],
      protocol: "cutoff.v1",
      agentKeyId: "key_1",
      mandateId: "man_1",
      quoteHashMaterial: "qt_3|1299|0|f_a|item_towels_12|2026-10-22",
    });
    expect(result).toEqual({ ok: false, error: "mandate_miss" });
    expect(pay.charges).toHaveLength(0);
    expect(repo.count()).toBe(0);
  });
});
