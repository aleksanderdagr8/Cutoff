import { describe, expect, it } from "vitest";
import {
  MemoryCatalogRepository,
  seedFixtureCatalog,
} from "./catalog.js";

describe("U4 MemoryCatalogRepository", () => {
  it("6-roll and 12-roll do not share an id", () => {
    const catalog = seedFixtureCatalog();
    const six = catalog.get("item_towels_6");
    const twelve = catalog.get("item_towels_12");
    expect(six).not.toBeNull();
    expect(twelve).not.toBeNull();
    expect(six!.canonicalItemId).not.toBe(twelve!.canonicalItemId);
    expect(six!.packCount).toBe(6);
    expect(twelve!.packCount).toBe(12);
  });

  it("fixture set has two pack sizes for towels, coffee, filter, kibble", () => {
    const catalog = seedFixtureCatalog();
    const ids = catalog.list().map((i) => i.canonicalItemId).sort();
    expect(ids).toEqual([
      "item_coffee_12oz",
      "item_coffee_24oz",
      "item_filter_1",
      "item_filter_2",
      "item_kibble_15lb",
      "item_kibble_5lb",
      "item_towels_12",
      "item_towels_6",
    ]);
  });

  it("rejects description containing < or a URL", () => {
    const catalog = new MemoryCatalogRepository();
    expect(
      catalog.ingest({
        gtin: "000999",
        packCount: 1,
        unit: "each",
        category: "x",
        description: "Bad <script>",
        brand: "X",
      }),
    ).toEqual({ ok: false, error: "invalid_description" });

    expect(
      catalog.ingest({
        gtin: "000998",
        packCount: 1,
        unit: "each",
        category: "x",
        description: "See https://evil.test",
        brand: "X",
      }),
    ).toEqual({ ok: false, error: "invalid_description" });
  });

  it("recall flag excludes item from quotable lookup", () => {
    const catalog = new MemoryCatalogRepository();
    const ingested = catalog.ingest({
      canonicalItemId: "item_recalled",
      gtin: "000777",
      packCount: 1,
      unit: "each",
      category: "x",
      description: "Recalled widget",
      brand: "X",
      recalled: true,
    });
    expect(ingested.ok).toBe(true);
    expect(catalog.get("item_recalled")?.recalled).toBe(true);
    expect(catalog.getQuotable("item_recalled")).toBeNull();
  });
});
