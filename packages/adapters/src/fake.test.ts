import { describe, expect, it } from "vitest";
import {
  FakePayAdapter,
  FakeFulfillAdapter,
  FakeTaxAdapter,
  FakeAggregatorOfferAdapter,
  FakeBrandFeedOfferAdapter,
  FakeEmailNotifyAdapter,
  reorderDueEmailText,
  StripeSandboxPayAdapter,
} from "./index.js";

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

  it("records attempt amount and can fail", async () => {
    const pay = new FakePayAdapter();
    pay.failNext = true;
    await expect(
      pay.charge({
        orderId: "ord_x",
        amountCents: 500,
        idempotencyKey: "idem_fail",
      }),
    ).rejects.toThrow("pay_adapter_error");
    expect(pay.attempts).toHaveLength(1);
    expect(pay.attempts[0]?.amountCents).toBe(500);
    expect(pay.charges).toHaveLength(0);
  });
});

describe("FakeEmailNotifyAdapter", () => {
  it("records reorder.due emails and formats copy", async () => {
    const email = new FakeEmailNotifyAdapter();
    const input = {
      householdId: "hh_1",
      lineId: "ll_1",
      displayName: "Coffee",
      dueAt: "2026-10-24T12:00:00.000Z",
    };
    const result = await email.sendReorderDue(input);
    expect(result.ok).toBe(true);
    expect(email.sent).toHaveLength(1);
    expect(reorderDueEmailText(input)).toMatch(/Coffee is due 2026-10-24/);
    expect(reorderDueEmailText(input)).toMatch(/callcutoff\.com\/home\/list/);
  });
});

describe("StripeSandboxPayAdapter", () => {
  it("dedupes like the fake (no network in CI)", async () => {
    const pay = new StripeSandboxPayAdapter();
    const a = await pay.charge({
      orderId: "ord_1",
      amountCents: 100,
      idempotencyKey: "idem_s",
    });
    const b = await pay.charge({
      orderId: "ord_1",
      amountCents: 100,
      idempotencyKey: "idem_s",
    });
    expect(a.chargeId).toBe(b.chargeId);
    expect(pay.charges).toHaveLength(1);
  });
});

describe("FakeFulfillAdapter", () => {
  it("accepts a place, cancel, and track", async () => {
    const fulfill = new FakeFulfillAdapter();
    const result = await fulfill.place({
      orderId: "ord_1",
      canonicalItemId: "item_1",
      qty: 1,
    });
    expect(result.status).toBe("accepted");
    expect(fulfill.jobs).toHaveLength(1);
    await fulfill.cancel({ jobId: result.jobId, orderId: "ord_1" });
    expect(fulfill.cancels).toHaveLength(1);
    const track = await fulfill.track({ jobId: result.jobId });
    expect(track.status).toBe("cancelled");
  });

  it("can fail place", async () => {
    const fulfill = new FakeFulfillAdapter();
    fulfill.failNextPlace = true;
    await expect(
      fulfill.place({
        orderId: "ord_x",
        canonicalItemId: "item_1",
        qty: 1,
      }),
    ).rejects.toThrow("fulfill_adapter_error");
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

describe("FakeAggregatorOfferAdapter", () => {
  it("returns seeded rows when up", async () => {
    const feed = new FakeAggregatorOfferAdapter([
      {
        externalSku: "A-1",
        gtin: "0001",
        packCount: 12,
        priceCents: 100,
        taxCents: 0,
        deliveryDateUtc: "2026-10-21",
        freshUntilUtc: "2026-10-20T00:00:00.000Z",
        inStock: true,
        fulfillerId: "fulfiller_a",
      },
    ]);
    const result = await feed.fetchOffers();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows).toHaveLength(1);
  });

  it("reports fulfiller_down without throwing", async () => {
    const feed = new FakeAggregatorOfferAdapter([]);
    feed.markDown();
    const result = await feed.fetchOffers();
    expect(result).toEqual({
      ok: false,
      error: "fulfiller_down",
      sourceId: "aggregator_fixture",
    });
  });
});

describe("FakeBrandFeedOfferAdapter", () => {
  it("filters to allowed GTINs (top items)", async () => {
    const feed = new FakeBrandFeedOfferAdapter(
      [
        {
          externalSku: "TOP",
          gtin: "111",
          packCount: 1,
          priceCents: 50,
          taxCents: 0,
          deliveryDateUtc: "2026-10-21",
          freshUntilUtc: "2026-10-20T00:00:00.000Z",
          inStock: true,
          fulfillerId: "fulfiller_brand",
        },
        {
          externalSku: "OTHER",
          gtin: "222",
          packCount: 1,
          priceCents: 50,
          taxCents: 0,
          deliveryDateUtc: "2026-10-21",
          freshUntilUtc: "2026-10-20T00:00:00.000Z",
          inStock: true,
          fulfillerId: "fulfiller_brand",
        },
      ],
      { allowedGtins: ["111"] },
    );
    const result = await feed.fetchOffers();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows).toHaveLength(1);
      expect(result.sourceId).toBe("brand_feed_fixture");
    }
  });
});
