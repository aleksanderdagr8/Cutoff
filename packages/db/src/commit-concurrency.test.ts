import { describe, expect, it } from "vitest";
import {
  FakePayAdapter,
  type ChargeInput,
  type ChargeResult,
  type PayAdapter,
} from "@cutoff/adapters";
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

/** Forces an await inside pay so concurrent commits actually interleave. */
class YieldingPay implements PayAdapter {
  constructor(private readonly inner: PayAdapter) {}

  async charge(input: ChargeInput): Promise<ChargeResult> {
    await new Promise((resolve) => setTimeout(resolve, 15));
    return this.inner.charge(input);
  }
}

function evidenced(
  quoteId: string,
  idempotencyKey: string,
  householdId = "hh_1",
) {
  return {
    householdId,
    canonicalItemId: "item_towels_12",
    quoteId,
    amountCents: 1299,
    idempotencyKey,
    mandate,
    addressId: "addr_home",
    nowUtc: "2026-10-19T12:00:00.000Z",
    actorChain: ["agent"],
    protocol: "cutoff.v1",
    agentKeyId: "key_1",
    mandateId: "man_1",
    quoteHashMaterial: `${quoteId}|1299|0|f_a|item_towels_12|2026-10-22`,
  };
}

describe("commit concurrency", () => {
  it("two sequential keys on one quote write one order, one charge, one evidence row", async () => {
    const pay = new FakePayAdapter();
    const repo = new MemoryOrderRepository(pay);
    const first = await repo.commitWithEvidence(evidenced("qt_seq", "idem_a"));
    const second = await repo.commitWithEvidence(evidenced("qt_seq", "idem_b"));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.order.orderId).toBe(first.order.orderId);
    expect(second.evidence.evidenceId).toBe(first.evidence.evidenceId);
    expect(repo.count()).toBe(1);
    expect(repo.chargeCount()).toBe(1);
    expect(pay.charges).toHaveLength(1);
    expect(
      repo.listEvents(first.order.orderId).filter((e) => e.status === "committed"),
    ).toHaveLength(1);
  });

  it("concurrent commits with different keys on one quote collapse to one order", async () => {
    const inner = new FakePayAdapter();
    const repo = new MemoryOrderRepository(new YieldingPay(inner));
    const results = await Promise.all([
      repo.commitWithEvidence(evidenced("qt_race", "idem_a")),
      repo.commitWithEvidence(evidenced("qt_race", "idem_b")),
      repo.commitWithEvidence(evidenced("qt_race", "idem_c")),
      repo.commitWithEvidence(evidenced("qt_race", "idem_d")),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    const orders = results.flatMap((r) => (r.ok ? [r.order.orderId] : []));
    const evidence = results.flatMap((r) => (r.ok ? [r.evidence.evidenceId] : []));
    expect(new Set(orders).size).toBe(1);
    expect(new Set(evidence).size).toBe(1);
    expect(results.filter((r) => r.ok && r.created)).toHaveLength(1);
    expect(repo.count()).toBe(1);
    expect(repo.chargeCount()).toBe(1);
    expect(inner.charges).toHaveLength(1);
    const orderId = orders[0]!;
    const statuses = repo.listEvents(orderId).map((e) => e.status);
    expect(statuses.filter((s) => s === "committed")).toEqual(["committed"]);
    expect(statuses.filter((s) => s === "captured")).toEqual(["captured"]);
    expect(repo.listEvents(orderId)).toHaveLength(statuses.length);
  });

  it("concurrent replays of the same idempotency key return the original order", async () => {
    const inner = new FakePayAdapter();
    const repo = new MemoryOrderRepository(new YieldingPay(inner));
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        repo.commitWithEvidence(evidenced("qt_same_key", "idem_once")),
      ),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    const ids = results.flatMap((r) => (r.ok ? [r.order.orderId] : []));
    expect(new Set(ids).size).toBe(1);
    expect(results.filter((r) => r.ok && r.created)).toHaveLength(1);
    expect(repo.count()).toBe(1);
    expect(inner.charges).toHaveLength(1);
    expect(repo.chargeCount()).toBe(1);
  });

  it("phase-0 double commit under concurrency keeps one charge", async () => {
    const inner = new FakePayAdapter();
    const repo = new MemoryOrderRepository(new YieldingPay(inner));
    const input = {
      householdId: "hh_1",
      canonicalItemId: "item_towels_12",
      quoteId: "qt_phase0",
      amountCents: 1299,
    };
    const [first, second] = await Promise.all([
      repo.commit({ ...input, idempotencyKey: "idem_p0_a" }),
      repo.commit({ ...input, idempotencyKey: "idem_p0_b" }),
    ]);
    expect(first.order.orderId).toBe(second.order.orderId);
    expect([first.created, second.created].filter(Boolean)).toHaveLength(1);
    expect(repo.count()).toBe(1);
    expect(inner.charges).toHaveLength(1);
  });

  it("marks the quote used once when concurrent commits share it", async () => {
    const quotes = new MemoryQuoteRepository();
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
    const repo = new MemoryOrderRepository(new YieldingPay(new FakePayAdapter()), quotes);
    await Promise.all([
      repo.commitWithEvidence(evidenced(created.quote.quoteId, "idem_q1")),
      repo.commitWithEvidence(evidenced(created.quote.quoteId, "idem_q2")),
    ]);
    const stored = await quotes.get(created.quote.quoteId);
    expect(stored?.committedAtUtc).toBe("2026-10-19T12:00:00.000Z");
    expect(quotes.listOpenHolds()).toHaveLength(0);
    expect(repo.count()).toBe(1);
  });
});
