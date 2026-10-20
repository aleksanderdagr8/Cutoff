import { describe, expect, it } from "vitest";
import { FakePayAdapter } from "@cutoff/adapters";
import { MemoryOrderRepository } from "./orders.js";
import { MemoryQuoteRepository } from "./quotes.js";

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

  it("one quote records one order; capture retries on order id without a second charge", async () => {
    const pay = new FakePayAdapter();
    const quotes = new MemoryQuoteRepository();
    const repo = new MemoryOrderRepository(pay, quotes);
    const created = await quotes.create({
      householdId: "hh_1",
      mandateId: "man_1",
      agentKeyId: "key_1",
      canonicalItemId: "item_towels_12",
      qty: 1,
      landedCents: 1299,
      taxCents: 0,
      unitPriceCents: 1299,
      deliveryDateUtc: "2026-10-22T00:00:00.000Z",
      fulfillerId: "f_a",
      offerId: "off_1",
      scoreInputs: {
        landedCents: 1299,
        deliveryDateUtc: "2026-10-22T00:00:00.000Z",
        merchantScore: 1,
      },
      addressId: "addr_home",
      ceilingCents: 5000,
      nowUtc: "2026-10-19T12:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const input = {
      householdId: "hh_1",
      canonicalItemId: "item_towels_12",
      quoteId: created.quote.quoteId,
      amountCents: 1299,
      idempotencyKey: "idem_once",
      mandate,
      addressId: "addr_home",
      nowUtc: "2026-10-19T12:00:00.000Z",
      actorChain: ["agent"],
      protocol: "cutoff.v1",
      agentKeyId: "key_1",
      mandateId: "man_1",
      quoteHashMaterial: "qt|1299|0|f_a|item_towels_12|2026-10-22",
    };

    const recorded = await repo.recordEvidencedCommit(input);
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;
    expect(recorded.created).toBe(true);
    expect(recorded.order.status).toBe("committed");
    expect(recorded.order.chargeId).toBeNull();
    expect(pay.charges).toHaveLength(0);
    expect(pay.attempts).toHaveLength(0);
    expect((await quotes.get(created.quote.quoteId))?.committedAtUtc).toBe(
      input.nowUtc,
    );
    expect(repo.count()).toBe(1);

    const captured = await repo.captureOrder(
      recorded.order.orderId,
      input.nowUtc,
    );
    const retried = await repo.captureOrder(recorded.order.orderId, input.nowUtc);
    expect(captured?.status).toBe("captured");
    expect(retried?.chargeId).toBe(captured?.chargeId);
    expect(pay.charges).toHaveLength(1);
    expect(pay.attempts[0]?.idempotencyKey).toBe(recorded.order.orderId);

    const otherKey = await repo.commitWithEvidence({
      ...input,
      idempotencyKey: "idem_other_key",
    });
    expect(otherKey.ok).toBe(true);
    if (!otherKey.ok) return;
    expect(otherKey.created).toBe(false);
    expect(otherKey.order.orderId).toBe(recorded.order.orderId);
    expect(repo.count()).toBe(1);
    expect(pay.charges).toHaveLength(1);
  });
});
