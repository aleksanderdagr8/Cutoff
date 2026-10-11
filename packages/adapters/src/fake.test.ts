import { describe, expect, it } from "vitest";
import { FakePayAdapter, FakeFulfillAdapter, FakeTaxAdapter } from "./index.js";

describe("FakePayAdapter", () => {
  it("dedupes charge by idempotency key", async () => {
    const pay = new FakePayAdapter();
    const a = await pay.charge({
      orderId: "ord_1",
      amountCents: 999,
      idempotencyKey: "idem_1",
    });
    const b = await pay.charge({
      orderId: "ord_1",
      amountCents: 999,
      idempotencyKey: "idem_1",
    });
    expect(a.chargeId).toBe(b.chargeId);
    expect(pay.charges).toHaveLength(1);
  });
});

describe("FakeFulfillAdapter", () => {
  it("accepts a place", async () => {
    const fulfill = new FakeFulfillAdapter();
    const result = await fulfill.place({
      orderId: "ord_1",
      canonicalItemId: "item_1",
      qty: 1,
    });
    expect(result.status).toBe("accepted");
    expect(fulfill.jobs).toHaveLength(1);
  });
});

describe("FakeTaxAdapter", () => {
  it("returns zero tax", async () => {
    const tax = new FakeTaxAdapter();
    const result = await tax.estimate({
      amountCents: 1000,
      addressId: "addr_1",
    });
    expect(result.taxCents).toBe(0);
  });
});
