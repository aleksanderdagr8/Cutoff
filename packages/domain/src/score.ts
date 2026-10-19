/**
 * Pure merchant score from ledger-shaped events. No I/O.
 * Unit 12: on-time / cancel / refund drive the tie-break only.
 */

export type MerchantScoreEventKind =
  | "on_time"
  | "late"
  | "cancel"
  | "refund";

export type MerchantScoreEvent = {
  kind: MerchantScoreEventKind;
};

/** Weights: higher is better. Tie-break only — never a fee. */
export const SCORE_WEIGHTS: Readonly<Record<MerchantScoreEventKind, number>> = {
  on_time: 1,
  late: -1,
  cancel: -2,
  refund: -2,
};

/** Materialize a merchant score from append-only event kinds. */
export function scoreFromEvents(
  events: readonly MerchantScoreEvent[],
): number {
  let score = 0;
  for (const e of events) {
    score += SCORE_WEIGHTS[e.kind] ?? 0;
  }
  return score;
}

/**
 * Overlay materialized scores onto offer candidates.
 * Unknown fulfillers stay at the candidate's existing score (usually 0).
 */
export function applyMerchantScores<T extends { fulfillerId: string; merchantScore: number }>(
  offers: readonly T[],
  scoresByFulfiller: ReadonlyMap<string, number>,
): T[] {
  return offers.map((o) => {
    const scored = scoresByFulfiller.get(o.fulfillerId);
    if (scored === undefined) return { ...o };
    return { ...o, merchantScore: scored };
  });
}

/** Drop suspended fulfillers from the candidate set. */
export function excludeSuspendedMerchants<T extends { fulfillerId: string }>(
  offers: readonly T[],
  isSuspended: (fulfillerId: string) => boolean,
): T[] {
  return offers.filter((o) => !isSuspended(o.fulfillerId));
}
