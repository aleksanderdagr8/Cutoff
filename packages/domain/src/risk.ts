/**
 * Pure risk gate. No I/O. Deterministic rules only.
 * Unit 7: spend is a rule, not an LLM.
 * Error string literals stay aligned with @cutoff/contracts ErrorCode — no import.
 */

/** Default: eleventh commit in a rolling hour fails. */
export const DEFAULT_VELOCITY_CAP_PER_HOUR = 10;

export type RiskFailCode = "kill_switch" | "mandate_miss";

export type RiskGateInput = {
  killSwitch: boolean;
  /** Address the commit will ship to. */
  addressId: string;
  /** Address already bound on the mandate. */
  mandateAddressId: string;
  /** Merchant / fulfiller suspended by risk. */
  merchantSuspended: boolean;
  /** Commits (successful or attempted-capture) in the last hour for this household. */
  commitsInLastHour: number;
  velocityCapPerHour?: number;
  /**
   * Agent key age in ms at commit time. Optional; when provided and below
   * minAgentAgeMs the gate fails closed (first-order step-up proxy).
   */
  keyAgeMs?: number;
  minAgentAgeMs?: number;
};

export type RiskGateResult =
  | { ok: true }
  | { ok: false; error: RiskFailCode };

/**
 * Sync deterministic checks. Caller supplies counts from Postgres/KV.
 * Order: kill switch → address → merchant suspend → key age → velocity.
 */
export function evaluateRiskGate(input: RiskGateInput): RiskGateResult {
  if (input.killSwitch) {
    return { ok: false, error: "kill_switch" };
  }

  if (input.addressId !== input.mandateAddressId) {
    return { ok: false, error: "mandate_miss" };
  }

  if (input.merchantSuspended) {
    return { ok: false, error: "mandate_miss" };
  }

  const minAge = input.minAgentAgeMs ?? 0;
  if (input.keyAgeMs !== undefined && input.keyAgeMs < minAge) {
    return { ok: false, error: "mandate_miss" };
  }

  const cap = input.velocityCapPerHour ?? DEFAULT_VELOCITY_CAP_PER_HOUR;
  if (input.commitsInLastHour >= cap) {
    // Spec Unit 7: eleventh commit fails. No dedicated ErrorCode — fail closed
    // as mandate_miss so the agent cannot spend past the velocity rule.
    return { ok: false, error: "mandate_miss" };
  }

  return { ok: true };
}

export type EvidenceFields = {
  actorChain: readonly string[];
  protocol: string;
  agentKeyId: string;
  mandateId: string;
  quoteHash: string;
  addressId: string;
  amountCents: number;
};

export type EvidenceValidation =
  | { ok: true }
  | { ok: false; error: "mandate_miss" };

/**
 * Evidence required on every commit (same transaction as committed event).
 * Missing actor chain or protocol fails the commit.
 */
export function validateEvidenceFields(
  fields: EvidenceFields,
): EvidenceValidation {
  if (!Array.isArray(fields.actorChain) || fields.actorChain.length === 0) {
    return { ok: false, error: "mandate_miss" };
  }
  for (const actor of fields.actorChain) {
    if (typeof actor !== "string" || actor.trim().length === 0) {
      return { ok: false, error: "mandate_miss" };
    }
  }
  if (typeof fields.protocol !== "string" || fields.protocol.trim().length === 0) {
    return { ok: false, error: "mandate_miss" };
  }
  if (!fields.agentKeyId || !fields.mandateId || !fields.quoteHash) {
    return { ok: false, error: "mandate_miss" };
  }
  if (!fields.addressId) {
    return { ok: false, error: "mandate_miss" };
  }
  if (!Number.isInteger(fields.amountCents) || fields.amountCents < 0) {
    return { ok: false, error: "mandate_miss" };
  }
  return { ok: true };
}

/** Canonical quote hash input — domain-pure string for evidence. */
export function quoteHashMaterial(parts: {
  quoteId: string;
  landedCents: number;
  taxCents: number;
  fulfillerId: string;
  canonicalItemId: string;
  deliveryDateUtc: string;
}): string {
  return [
    parts.quoteId,
    String(parts.landedCents),
    String(parts.taxCents),
    parts.fulfillerId,
    parts.canonicalItemId,
    parts.deliveryDateUtc,
  ].join("|");
}
