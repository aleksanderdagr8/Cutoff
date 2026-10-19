/**
 * Pure mandate checks. No I/O.
 * Unit 3: the contract the agent cannot widen.
 * Error string literals stay aligned with @cutoff/contracts ErrorCode — no import.
 */

export type MandateFailCode = "mandate_miss" | "over_ceiling";

export type MandateSnapshot = {
  ceilingCents: number;
  expiresAtUtc: string;
  /** Empty means category allow-list governs; both empty = no items allowed. */
  canonicalItemIds: readonly string[];
  categoryAllowList: readonly string[];
  neverSubstituteIds: readonly string[];
  addressId: string;
  /** Max concurrent/open actor chain length the mandate permits. */
  actorCap: number;
};

export type MandateCheckInput = {
  mandate: MandateSnapshot;
  canonicalItemId: string;
  /** Optional category of the item for allow-list match. */
  category?: string;
  amountCents: number;
  /** Address the agent is trying to ship to. Must match mandate. */
  addressId: string;
  /** ISO-8601 UTC "now" injected by caller (domain stays pure). */
  nowUtc: string;
};

export type MandateCheckResult =
  | { ok: true }
  | { ok: false; error: MandateFailCode };

function isExpired(expiresAtUtc: string, nowUtc: string): boolean {
  return Date.parse(nowUtc) >= Date.parse(expiresAtUtc);
}

function itemAllowed(
  mandate: MandateSnapshot,
  canonicalItemId: string,
  category: string | undefined,
): boolean {
  if (mandate.canonicalItemIds.includes(canonicalItemId)) {
    return true;
  }
  if (
    category !== undefined &&
    mandate.categoryAllowList.includes(category)
  ) {
    return true;
  }
  return false;
}

/**
 * Fail-closed mandate evaluation for quote/commit.
 * Expired → mandate_miss. Over ceiling → over_ceiling (spec also allows
 * mandate_miss on commit over ceiling; callers may map either; we return
 * over_ceiling for ceiling and mandate_miss for everything else).
 */
export function checkMandate(input: MandateCheckInput): MandateCheckResult {
  const { mandate, canonicalItemId, category, amountCents, addressId, nowUtc } =
    input;

  if (isExpired(mandate.expiresAtUtc, nowUtc)) {
    return { ok: false, error: "mandate_miss" };
  }

  if (addressId !== mandate.addressId) {
    return { ok: false, error: "mandate_miss" };
  }

  if (!itemAllowed(mandate, canonicalItemId, category)) {
    return { ok: false, error: "mandate_miss" };
  }

  if (amountCents > mandate.ceilingCents) {
    return { ok: false, error: "over_ceiling" };
  }

  return { ok: true };
}

/**
 * Commit path: over ceiling is reported as mandate_miss per Unit 3 exit
 * ("Commit over ceiling returns mandate_miss and writes no charge").
 */
export function checkMandateForCommit(
  input: MandateCheckInput,
): MandateCheckResult {
  const result = checkMandate(input);
  if (!result.ok && result.error === "over_ceiling") {
    return { ok: false, error: "mandate_miss" };
  }
  return result;
}

export type AgentMandateMutation = {
  raiseCeiling?: boolean;
  addAddress?: boolean;
  newAddressId?: string;
  newCeilingCents?: number;
};

/**
 * Agents cannot widen the mandate. Returns a typed failure code when attempted.
 */
export function agentMandateWidenDenied(
  mutation: AgentMandateMutation,
): MandateFailCode | null {
  if (mutation.raiseCeiling === true || mutation.newCeilingCents !== undefined) {
    return "mandate_miss";
  }
  if (mutation.addAddress === true || mutation.newAddressId !== undefined) {
    return "mandate_miss";
  }
  return null;
}

/**
 * Human may lower (or keep) the ceiling, never raise via this helper.
 * Returns null when the requested ceiling is higher than current.
 */
export function applyLowerCeiling(
  currentCeilingCents: number,
  requestedCeilingCents: number,
): number | null {
  if (
    !Number.isInteger(requestedCeilingCents) ||
    requestedCeilingCents < 0 ||
    requestedCeilingCents > currentCeilingCents
  ) {
    return null;
  }
  return requestedCeilingCents;
}

export type AgentScope = "quote" | "commit" | "read_list";

const ALLOWED_SCOPES: readonly AgentScope[] = [
  "quote",
  "commit",
  "read_list",
];

/** Forbidden scopes that must never be issued. */
export const FORBIDDEN_SCOPES = ["raise_cap", "new_address"] as const;

export function isAllowedScope(scope: string): scope is AgentScope {
  return (ALLOWED_SCOPES as readonly string[]).includes(scope);
}

export function scopesAreValid(scopes: readonly string[]): boolean {
  if (scopes.length === 0) return false;
  for (const s of scopes) {
    if ((FORBIDDEN_SCOPES as readonly string[]).includes(s)) return false;
    if (!isAllowedScope(s)) return false;
  }
  return true;
}

export function hasScope(
  scopes: readonly string[],
  needed: AgentScope,
): boolean {
  return scopes.includes(needed);
}
