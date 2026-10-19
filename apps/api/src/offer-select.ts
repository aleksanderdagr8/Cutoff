/**
 * Shared quote candidate selection: suspend filter + merchant_scores overlay.
 * Used by quote and list reorder so ranking stays consistent.
 */

import {
  applyMerchantScores,
  classifyOffersForQuote,
  excludeSuspendedMerchants,
  pickWinner,
  type OfferCandidate,
} from "@cutoff/domain";
import type { OfferRow } from "@cutoff/db";
import type { ApiBindings } from "./bindings.js";

export function offerRowToCandidate(row: OfferRow): OfferCandidate {
  return {
    offerId: row.offerId,
    fulfillerId: row.fulfillerId,
    priceCents: row.priceCents,
    taxCents: row.taxCents,
    landedCents: row.priceCents + row.taxCents,
    deliveryDateUtc: row.deliveryDateUtc,
    merchantScore: row.merchantScore,
    inStock: row.inStock,
    freshUntilUtc: row.freshUntilUtc,
  };
}

/**
 * Fresh, non-suspended offers with merchant_scores applied for ranking.
 */
export function rankedCandidatesForItem(
  bindings: ApiBindings,
  canonicalItemId: string,
  nowUtc: string,
):
  | { ok: true; winner: OfferCandidate; candidates: OfferCandidate[] }
  | { ok: false; error: "stale_offer" | "out_of_stock" } {
  const raw = bindings.offers
    .listForItem(canonicalItemId)
    .map(offerRowToCandidate);

  const active = excludeSuspendedMerchants(raw, (id) =>
    bindings.risk.isMerchantSuspended(id),
  );
  const scored = applyMerchantScores(active, bindings.risk.scoresByFulfiller());

  const classified = classifyOffersForQuote(scored, nowUtc);
  if (classified.kind === "fresh") {
    const winner = pickWinner(classified.offers);
    if (!winner) return { ok: false, error: "out_of_stock" };
    return { ok: true, winner, candidates: classified.offers };
  }
  if (classified.kind === "stale_only") {
    return { ok: false, error: "stale_offer" };
  }
  return { ok: false, error: "out_of_stock" };
}
