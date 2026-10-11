import { describe, expect, it } from "vitest";
import { compareRank, withinCeiling, holdKey } from "./index.js";

describe("compareRank", () => {
  it("prefers lower landed price", () => {
    const cheaper = {
      landedCents: 100,
      deliveryDateUtc: "2026-10-12",
      merchantScore: 0,
    };
    const dearer = {
      landedCents: 200,
      deliveryDateUtc: "2026-10-11",
      merchantScore: 10,
    };
    expect(compareRank(cheaper, dearer)).toBeLessThan(0);
  });

  it("breaks price ties by earlier delivery", () => {
    const earlier = {
      landedCents: 100,
      deliveryDateUtc: "2026-10-11",
      merchantScore: 0,
    };
    const later = {
      landedCents: 100,
      deliveryDateUtc: "2026-10-12",
      merchantScore: 5,
    };
    expect(compareRank(earlier, later)).toBeLessThan(0);
  });

  it("breaks delivery ties by higher merchant score", () => {
    const higher = {
      landedCents: 100,
      deliveryDateUtc: "2026-10-12",
      merchantScore: 3,
    };
    const lower = {
      landedCents: 100,
      deliveryDateUtc: "2026-10-12",
      merchantScore: 1,
    };
    expect(compareRank(higher, lower)).toBeLessThan(0);
  });
});

describe("withinCeiling", () => {
  it("allows amount at or under ceiling", () => {
    expect(withinCeiling({ ceilingCents: 500, amountCents: 500 })).toBe(true);
    expect(withinCeiling({ ceilingCents: 500, amountCents: 501 })).toBe(false);
  });
});

describe("holdKey", () => {
  it("joins household and item", () => {
    expect(
      holdKey({ householdId: "hh_1", canonicalItemId: "item_1" }),
    ).toBe("hh_1:item_1");
  });
});
