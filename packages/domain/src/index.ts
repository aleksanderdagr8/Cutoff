/**
 * Pure domain functions. No I/O. No adapters. No repositories.
 */

export type { RankInputs } from "./rank.js";
export { compareRank } from "./rank.js";

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

export {
  validateDescription,
  unitPriceCents,
  isExcludedByRecall,
} from "./catalog.js";

export type { DescriptionValidation } from "./catalog.js";

export {
  MAX_QUOTE_TTL_MS,
  classifyOffersForQuote,
  rankOffers,
  pickWinner,
  quoteAmountsForPack,
  isQuoteExpired,
  quoteExpiresAt,
} from "./quote.js";

export type {
  OfferCandidate,
  FreshnessResult,
  QuoteAmounts,
} from "./quote.js";

export {
  DEFAULT_VELOCITY_CAP_PER_HOUR,
  evaluateRiskGate,
  validateEvidenceFields,
  quoteHashMaterial,
} from "./risk.js";

export type {
  RiskFailCode,
  RiskGateInput,
  RiskGateResult,
  EvidenceFields,
  EvidenceValidation,
} from "./risk.js";

export {
  SCORE_WEIGHTS,
  scoreFromEvents,
  applyMerchantScores,
  excludeSuspendedMerchants,
} from "./score.js";

export type {
  MerchantScoreEventKind,
  MerchantScoreEvent,
} from "./score.js";

export { assembleEvidencePack } from "./evidence-pack.js";

export type {
  EvidencePack,
  EvidencePackInput,
  EvidencePackResult,
} from "./evidence-pack.js";

export {
  DEFAULT_WEBHOOK_REPLAY_WINDOW_MS,
  canCancelOrder,
  acceptInboundShipmentEvent,
  isLateShip,
  signaturesEqual,
} from "./fulfill.js";

export type {
  OrderLifecycleStatus,
  CancelFailCode,
  CancelCheckInput,
  CancelCheckResult,
  InboundAcceptResult,
} from "./fulfill.js";

export {
  canViewReceipt,
  receiptSkipAction,
  whyThisSeller,
} from "./receipt.js";

export type {
  ReceiptViewerSession,
  ReceiptSkipAction,
} from "./receipt.js";

export {
  REORDER_BANNED_FIELD_NAMES,
  hasBannedReorderField,
  applyListLineSkip,
  stickyFulfillerForReorder,
  computeNextDue,
  isDueWithin,
} from "./list.js";

export type {
  ReorderBannedField,
  ListLinePauseState,
  ComputeNextDueInput,
  ComputeNextDueResult,
} from "./list.js";
