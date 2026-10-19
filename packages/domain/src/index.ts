/**
 * Pure domain functions. No I/O. No adapters. No repositories.
 */

export type RankInputs = {
  landedCents: number;
  deliveryDateUtc: string;
  merchantScore: number;
};

/**
 * Rank order (brief/spec): lower landed price, then earlier delivery, then higher score.
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

export type MandateCeiling = {
  ceilingCents: number;
  amountCents: number;
};

/** Pure ceiling check. Returns true when amount is within the mandate ceiling. */
export function withinCeiling(m: MandateCeiling): boolean {
  return m.amountCents <= m.ceilingCents;
}

export type HoldKey = {
  householdId: string;
  canonicalItemId: string;
};

export function holdKey(h: HoldKey): string {
  return `${h.householdId}:${h.canonicalItemId}`;
}

export {
  checkMandate,
  checkMandateForCommit,
  agentMandateWidenDenied,
  applyLowerCeiling,
  isAllowedScope,
  scopesAreValid,
  hasScope,
  FORBIDDEN_SCOPES,
} from "./mandate.js";

export type {
  MandateSnapshot,
  MandateCheckInput,
  MandateCheckResult,
  MandateFailCode,
  AgentMandateMutation,
  AgentScope,
} from "./mandate.js";
