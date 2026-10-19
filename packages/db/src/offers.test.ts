import { describe, expect, it } from "vitest";
import { FakeAggregatorOfferAdapter } from "@cutoff/adapters";
import { seedFixtureCatalog } from "./catalog.js";
import {
  MemoryOfferRepository,
  rawFeedFromOffers,
  seedDualFulfillerOffers,
} from "./offers.js";

describe("U5 MemoryOfferRepository", () => {
  it("two fulfillers on one canonical id both appear", () => {
    const offers = seedDualFulfillerOffers(new MemoryOfferRepository());
    const towels = offers.listForItem("item_towels_12");
    expect(towels).toHaveLength(2);
    expect(towels.map((o) => o.fulfillerId).sort()).toEqual([
      "fulfiller_a",
      "fulfiller_b",
    ]);
  });

  it("offer past fresh_until is still stored but selectable filter is caller's job", () => {
    const offers = new MemoryOfferRepository();
    offers.upsertNormalized({
      canonicalItemId: "item_towels_12",
      fulfillerId: "fulfiller_a",
      sourceId: "aggregator_fixture",
      externalSku: "A-TOWEL-12",
      priceCents: 1299,
      taxCents: 0,
      deliveryDateUtc: "2026-10-21",
      freshUntilUtc: "2026-10-18T00:00:00.000Z",
      inStock: true,
      merchantScore: 0,
    });
    const row = offers.listForItem("item_towels_12")[0]!;
    expect(Date.parse(row.freshUntilUtc)).toBeLessThan(
      Date.parse("2026-10-19T12:00:00.000Z"),
    );
  });

  it("adapter failure marks source down and preserves last good offer", async () => {
    const catalog = seedFixtureCatalog();
    const offers = seedDualFulfillerOffers(new MemoryOfferRepository());
    const before = offers.listForItem("item_towels_12");
    expect(before.length).toBe(2);

    const adapter = new FakeAggregatorOfferAdapter(
      rawFeedFromOffers(catalog, [...offers.listAll()]),
      { sourceId: "aggregator_fixture" },
    );
    adapter.markDown();

    const result = await offers.ingestFromAdapter(
      adapter,
      catalog,
      "2026-10-19T12:00:00.000Z",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("fulfiller_down");
    expect(result.preserved).toBeGreaterThan(0);
    expect(offers.sourceState("aggregator_fixture")?.down).toBe(true);
    expect(offers.listForItem("item_towels_12")).toHaveLength(2);
    expect(offers.listForItem("item_towels_12")[0]!.priceCents).toBe(
      before[0]!.priceCents,
    );
  });
});
