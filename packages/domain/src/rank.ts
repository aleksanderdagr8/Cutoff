/**
 * Pure rank. No I/O.
 * Order: lower landed price → earlier delivery → higher merchant score.
 */

export type RankInputs = {
  landedCents: number;
  deliveryDateUtc: string;
  merchantScore: number;
};

/**
 * Returns negative if a wins over b, positive if b wins, 0 if tied.
 */
export function compareRank(a: RankInputs, b: RankInputs): number {
  if (a.landedCents !== b.landedCents) {
    return a.landedCents - b.landedCents;
  }
  if (a.deliveryDateUtc !== b.deliveryDateUtc) {
    return a.deliveryDateUtc < b.deliveryDateUtc ? -1 : 1;
  }
  return b.merchantScore - a.merchantScore;
}
