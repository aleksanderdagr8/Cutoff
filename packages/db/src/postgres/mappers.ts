import type { AgentScope } from "@cutoff/domain";
import type { AgentCredentialRow } from "../agents.js";
import type { CadenceSource, ListLineRow } from "../list.js";
import type { MandateRow } from "../mandates.js";
import type {
  HouseholdNudgeSettingsRow,
  NudgeChannel,
  NudgeStatus,
  ReorderNudgeRow,
} from "../nudges.js";
import type {
  ChargeRow,
  EvidenceRow,
  OrderEventRow,
  OrderRow,
  OrderStatusEvent,
} from "../orders.js";
import type {
  HoldRow,
  QuoteRow,
  QuoteScoreInputs,
  QuoteSubstituteDiff,
} from "../quotes.js";

export type DbMandate = {
  mandate_id: string;
  household_id: string;
  ceiling_cents: number;
  expires_at_utc: string;
  address_id: string;
  actor_cap: number;
  allow_cancel: boolean;
  created_at: string;
  updated_at: string;
};

export type DbMandateLine = {
  kind: "canonical_item" | "category_allow" | "never_substitute";
  value: string;
};

export type DbAgent = {
  key_id: string;
  household_id: string;
  secret_hash: string;
  scopes: string[];
  mandate_ids: string[];
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

export type DbQuote = {
  quote_id: string;
  household_id: string;
  mandate_id: string;
  agent_key_id: string;
  canonical_item_id: string;
  qty: number;
  landed_cents: number;
  tax_cents: number;
  unit_price_cents: number;
  delivery_date_utc: string;
  fulfiller_id: string;
  offer_id: string;
  score_inputs: QuoteScoreInputs;
  address_id: string;
  ceiling_cents: number;
  expires_at_utc: string;
  created_at: string;
  committed_at_utc: string | null;
  substitute: QuoteSubstituteDiff | null;
};

export type DbHold = {
  household_id: string;
  canonical_item_id: string;
  quote_id: string;
};

export type DbOrder = {
  order_id: string;
  household_id: string;
  canonical_item_id: string;
  quote_id: string;
  amount_cents: number;
  charge_id: string | null;
  idempotency_key: string;
  status: OrderStatusEvent;
  created_at: string;
};

export type DbOrderEvent = {
  event_id: string;
  order_id: string;
  status: OrderStatusEvent;
  at_utc: string;
};

export type DbEvidence = {
  evidence_id: string;
  order_id: string;
  actor_chain: string[];
  protocol: string;
  agent_key_id: string;
  mandate_id: string;
  quote_hash: string;
  address_id: string;
  amount_cents: number;
  created_at: string;
};

export type DbCharge = {
  charge_id: string;
  order_id: string;
  amount_cents: number;
  idempotency_key: string;
  created_at: string;
};

export type DbListLine = {
  line_id: string;
  household_id: string;
  mandate_id: string;
  canonical_item_id: string;
  cadence_hint_days: number | null;
  cadence_source: CadenceSource;
  learned_interval_days: number | null;
  never_substitute: boolean;
  last_quote_id: string | null;
  last_order_id: string | null;
  last_ordered_at: string | null;
  next_due_at: string | null;
  snoozed_until: string | null;
  lead_days: number;
  paused: boolean;
  created_at: string;
};

export type DbHouseholdNudgeSettings = {
  household_id: string;
  agent_webhook_url: string | null;
  agent_webhook_secret_ref: string | null;
  email_enabled: boolean;
  auto_commit_enabled: boolean;
  updated_at: string;
};

export type DbReorderNudge = {
  nudge_id: string;
  household_id: string;
  line_id: string;
  due_at: string;
  channel: NudgeChannel;
  status: NudgeStatus;
  attempts: number;
  resolved_order_id: string | null;
  created_at: string;
};

export function mapMandate(
  row: DbMandate,
  lines: readonly DbMandateLine[],
): MandateRow {
  return {
    mandateId: row.mandate_id,
    householdId: row.household_id,
    ceilingCents: row.ceiling_cents,
    expiresAtUtc: row.expires_at_utc,
    canonicalItemIds: lines
      .filter((l) => l.kind === "canonical_item")
      .map((l) => l.value),
    categoryAllowList: lines
      .filter((l) => l.kind === "category_allow")
      .map((l) => l.value),
    neverSubstituteIds: lines
      .filter((l) => l.kind === "never_substitute")
      .map((l) => l.value),
    addressId: row.address_id,
    actorCap: row.actor_cap,
    allowCancel: row.allow_cancel,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAgent(row: DbAgent): AgentCredentialRow {
  return {
    keyId: row.key_id,
    householdId: row.household_id,
    secretHash: row.secret_hash,
    scopes: row.scopes as AgentScope[],
    mandateIds: row.mandate_ids,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  };
}

export function mapQuote(row: DbQuote): QuoteRow {
  return {
    quoteId: row.quote_id,
    householdId: row.household_id,
    mandateId: row.mandate_id,
    agentKeyId: row.agent_key_id,
    canonicalItemId: row.canonical_item_id,
    qty: row.qty,
    landedCents: row.landed_cents,
    taxCents: row.tax_cents,
    unitPriceCents: row.unit_price_cents,
    deliveryDateUtc: row.delivery_date_utc,
    fulfillerId: row.fulfiller_id,
    offerId: row.offer_id,
    scoreInputs: row.score_inputs,
    addressId: row.address_id,
    ceilingCents: row.ceiling_cents,
    expiresAtUtc: row.expires_at_utc,
    createdAt: row.created_at,
    committedAtUtc: row.committed_at_utc,
    substitute: row.substitute,
  };
}

export function mapHold(row: DbHold): HoldRow {
  return {
    householdId: row.household_id,
    canonicalItemId: row.canonical_item_id,
    quoteId: row.quote_id,
  };
}

export function mapOrder(row: DbOrder): OrderRow {
  return {
    orderId: row.order_id,
    householdId: row.household_id,
    canonicalItemId: row.canonical_item_id,
    quoteId: row.quote_id,
    amountCents: row.amount_cents,
    chargeId: row.charge_id,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    status: row.status,
  };
}

export function mapOrderEvent(row: DbOrderEvent): OrderEventRow {
  return {
    eventId: row.event_id,
    orderId: row.order_id,
    status: row.status,
    atUtc: row.at_utc,
  };
}

export function mapEvidence(row: DbEvidence): EvidenceRow {
  return {
    evidenceId: row.evidence_id,
    orderId: row.order_id,
    actorChain: row.actor_chain,
    protocol: row.protocol,
    agentKeyId: row.agent_key_id,
    mandateId: row.mandate_id,
    quoteHash: row.quote_hash,
    addressId: row.address_id,
    amountCents: row.amount_cents,
    createdAt: row.created_at,
  };
}

export function mapCharge(row: DbCharge): ChargeRow {
  return {
    chargeId: row.charge_id,
    orderId: row.order_id,
    amountCents: row.amount_cents,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  };
}

export function mapListLine(row: DbListLine): ListLineRow {
  return {
    lineId: row.line_id,
    householdId: row.household_id,
    mandateId: row.mandate_id,
    canonicalItemId: row.canonical_item_id,
    cadenceHintDays: row.cadence_hint_days,
    cadenceSource: row.cadence_source,
    learnedIntervalDays: row.learned_interval_days,
    neverSubstitute: row.never_substitute,
    lastQuoteId: row.last_quote_id,
    lastOrderId: row.last_order_id,
    lastOrderedAt: row.last_ordered_at,
    nextDueAt: row.next_due_at,
    snoozedUntil: row.snoozed_until,
    leadDays: row.lead_days,
    paused: row.paused,
    createdAt: row.created_at,
  };
}

export function mapHouseholdNudgeSettings(
  row: DbHouseholdNudgeSettings,
): HouseholdNudgeSettingsRow {
  return {
    householdId: row.household_id,
    agentWebhookUrl: row.agent_webhook_url,
    agentWebhookSecretRef: row.agent_webhook_secret_ref,
    emailEnabled: row.email_enabled,
    autoCommitEnabled: false,
    updatedAt: row.updated_at,
  };
}

export function mapReorderNudge(row: DbReorderNudge): ReorderNudgeRow {
  return {
    nudgeId: row.nudge_id,
    householdId: row.household_id,
    lineId: row.line_id,
    dueAt: row.due_at,
    channel: row.channel,
    status: row.status,
    attempts: row.attempts,
    resolvedOrderId: row.resolved_order_id,
    createdAt: row.created_at,
  };
}

export function throwOnError(
  error: { message: string } | null,
  context: string,
): void {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}
