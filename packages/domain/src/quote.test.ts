import { describe, expect, it } from "vitest";
import {
  MAX_QUOTE_TTL_MS,
  classifyOffersForQuote,
  pickWinner,
  quoteAmountsForPack,
  quoteExpiresAt,
  rankOffers,
  type OfferCandidate,
} from "./quote.js";

function offer(
  partial: Partial<OfferCandidate> & Pick<OfferCandidate, "offerId" | "landedCents">,
): OfferCandidate {
  return {
    fulfillerId: "ff_a",
    priceCents: partial.landedCents,
    taxCents: 0,
    inStock: true,
    freshUntilUtc: "2026-10-20T00:00:00.000Z",
    deliveryDateUtc: "2026-10-21",
    merchantScore: 0,
    ...partial,
  };
}

describe("pickWinner", () => {
  it("cheaper landed wins when delivery and score tie", () => {
    const winner = pickWinner([
      offer({
        offerId: "o_dear",
        landedCents: 1499,
        priceCents: 1499,
        deliveryDateUtc: "2026-10-21",
        merchantScore: 0,
      }),
      offer({
        offerId: "o_cheap",
        landedCents: 1299,
        priceCents: 1299,
        deliveryDateUtc: "2026-10-21",
        merchantScore: 0,
      }),
    ]);
    expect(winner?.offerId).toBe("o_cheap");
  });
});

describe("rankOffers", () => {
  it("surfaces both fulfillers ordered by price", () => {
    const ranked = rankOffers([
      offer({ offerId: "b", landedCents: 1500, fulfillerId: "ff_b" }),
      offer({ offerId: "a", landedCents: 1000, fulfillerId: "ff_a" }),
    ]);
    expect(ranked.map((o) => o.fulfillerId)).toEqual(["ff_a", "ff_b"]);
  });
});

describe("classifyOffersForQuote", () => {
  it("returns stale_only when stock exists but fresh_until passed", () => {
    const result = classifyOffersForQuote(
      [
        offer({
          offerId: "stale",
          landedCents: 1000,
          freshUntilUtc: "2026-10-18T00:00:00.000Z",
        }),
      ],
      "2026-10-19T12:00:00.000Z",
    );
    expect(result.kind).toBe("stale_only");
  });

  it("returns fresh selectable offers", () => {
    const result = classifyOffersForQuote(
      [
        offer({
          offerId: "ok",
          landedCents: 1000,
          freshUntilUtc: "2026-10-20T00:00:00.000Z",
        }),
      ],
      "2026-10-19T12:00:00.000Z",
    );
    expect(result.kind).toBe("fresh");
  });
});

describe("quoteAmountsForPack", () => {
  it("returns unit price as landed / pack_count", () => {
    const amounts = quoteAmountsForPack(
      offer({ offerId: "o", landedCents: 1200, priceCents: 1200, taxCents: 0 }),
      12,
      1,
    );
    expect(amounts.landedCents).toBe(1200);
    expect(amounts.unitPriceCents).toBe(100);
  });
});

describe("quoteExpiresAt", () => {
  it("caps TTL under 10 minutes", () => {
    const expires = quoteExpiresAt("2026-10-19T12:00:00.000Z", 60 * 60 * 1000);
    const delta =
      Date.parse(expires) - Date.parse("2026-10-19T12:00:00.000Z");
    expect(delta).toBe(MAX_QUOTE_TTL_MS);
    expect(delta).toBeLessThan(10 * 60 * 1000);
  });
});
