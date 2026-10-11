import { describe, expect, it } from "vitest";
import { FakePayAdapter } from "@cutoff/adapters";
import { MemoryOrderRepository } from "./orders.js";

describe("MemoryOrderRepository idempotency (U0)", () => {
  it("fake commit twice with the same key returns the same order id and one row", async () => {
    const pay = new FakePayAdapter();
    const repo = new MemoryOrderRepository(pay);

    const input = {
      householdId: "hh_u0",
      canonicalItemId: "item_towels_12",
      quoteId: "qt_u0",
      amountCents: 1299,
      idempotencyKey: "idem_u0_double",
    };

    const first = await repo.commit(input);
    const second = await repo.commit(input);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.order.orderId).toBe(first.order.orderId);
    expect(repo.count()).toBe(1);
    expect(pay.charges).toHaveLength(1);
  });
});
