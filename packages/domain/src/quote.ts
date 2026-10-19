/**
 * Pure quote selection. No I/O.
 * Unit 6: one winner by landed → delivery → score; freshness is a gate.
 */

import { compareRank, type RankInputs } from "./rank.js";
import { unitPriceCents } from "./catalog.js";

/** Spec: quote expiry under 10 minutes. */
export const MAX_QUOTE_TTL_MS = 9 * 60 * 1000;

export type OfferCandidate = RankInputs & {
  offerId: string;
  fulfillerId: string;
  priceCents: number;
  taxCents: number;
  inStock: boolean;
  freshUntilUtc: string;
};

export type FreshnessResult =
  | { kind: "fresh"; offers: OfferCandidate[] }
  | { kind: "stale_only" }
  | { kind: "none" };

/**
 * Fresh + in-stock offers are selectable.
 * If none are selectable but at least one in-stock offer is past fresh_until → stale_only.
 * Otherwise none (out of stock / empty).
 */
export function classifyOffersForQuote(
  offers: readonly OfferCandidate[],
  nowUtc: string,
): FreshnessResult {
  const now = Date.parse(nowUtc);
  const fresh = offers.filter(
    (o) => o.inStock && Date.parse(o.freshUntilUtc) > now,
  );
  if (fresh.length > 0) {
    return { kind: "fresh", offers: [...fresh] };
  }
  const hasStaleInStock = offers.some(
    (o) => o.inStock && Date.parse(o.freshUntilUtc) <= now,
  );
  if (hasStaleInStock) {
    return { kind: "stale_only" };
  }
  return { kind: "none" };
}

/** Rank ascending (best first). Stable on equal rank by offerId. */
export function rankOffers(
  offers: readonly OfferCandidate[],
): OfferCandidate[] {
  return [...offers].sort((a, b) => {
    const cmp = compareRank(a, b);
    if (cmp !== 0) return cmp;
    return a.offerId < b.offerId ? -1 : a.offerId > b.offerId ? 1 : 0;
  });
}

export function pickWinner(
  offers: readonly OfferCandidate[],
): OfferCandidate | null {
  if (offers.length === 0) return null;
  return rankOffers(offers)[0] ?? null;
}

export type QuoteAmounts = {
  landedCents: number;
  taxCents: number;
  unitPriceCents: number;
};

export function quoteAmountsForPack(
  winner: OfferCandidate,
  packCount: number,
  qty: number,
): QuoteAmounts {
  const linePrice = winner.priceCents * qty;
  const lineTax = winner.taxCents * qty;
  const landedCents = linePrice + lineTax;
  return {
    landedCents,
    taxCents: lineTax,
    unitPriceCents: unitPriceCents(landedCents, packCount * qty),
  };
}

export function isQuoteExpired(expiresAtUtc: string, nowUtc: string): boolean {
  return Date.parse(nowUtc) >= Date.parse(expiresAtUtc);
}

export function quoteExpiresAt(
  nowUtc: string,
  ttlMs: number = MAX_QUOTE_TTL_MS,
): string {
  const ttl = Math.min(ttlMs, MAX_QUOTE_TTL_MS);
  return new Date(Date.parse(nowUtc) + ttl).toISOString();
}
