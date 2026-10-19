/**
 * Pure receipt / skip rules. No I/O.
 * Unit 10: the cardholder can understand the charge without the agent.
 * Error string literals stay aligned with @cutoff/contracts — no import.
 */

import type { RankInputs } from "./rank.js";

export type ReceiptViewerSession = {
  role: "member" | "anon" | "service_role";
  memberId?: string;
  householdId?: string;
};

/**
 * Member of the receipt's household may view. Non-member and anon fail closed.
 * Service role is for workers assembling the page — not the browser path.
 */
export function canViewReceipt(
  session: ReceiptViewerSession,
  receiptHouseholdId: string,
): boolean {
  if (session.role === "anon") return false;
  if (session.role === "service_role") return true;
  return (
    session.role === "member" &&
    !!session.memberId &&
    session.householdId === receiptHouseholdId
  );
}

export type ReceiptSkipAction = "cancel" | "return_request" | "none";

/**
 * Skip before ship cancels. Skip after ship opens a return request.
 * No retention interstitial — one action, one outcome.
 */
export function receiptSkipAction(
  status:
    | "committed"
    | "captured"
    | "failed"
    | "placed"
    | "shipped"
    | "delivered"
    | "refunded",
): ReceiptSkipAction {
  if (status === "captured" || status === "placed") return "cancel";
  if (status === "shipped" || status === "delivered") return "return_request";
  return "none";
}

/** Why-this-seller: the three rank inputs, nothing else. */
export function whyThisSeller(inputs: RankInputs): {
  landed_cents: number;
  delivery_date: string;
  merchant_score: number;
} {
  return {
    landed_cents: inputs.landedCents,
    delivery_date: inputs.deliveryDateUtc,
    merchant_score: inputs.merchantScore,
  };
}

/** Allowlisted keys for agent GET /v1/orders/:orderId (Unit 16). */
export const AGENT_ORDER_RECEIPT_ALLOWLIST = [
  "order_id",
  "status",
  "amount_cents",
  "canonical_item_id",
  "display_name",
  "fulfiller_id",
  "why_this_seller",
  "job_id",
  "tracking_number",
  "shipment_events",
  "receipt_url",
  "summary",
] as const;

export type AgentOrderReceiptAllowlistKey =
  (typeof AGENT_ORDER_RECEIPT_ALLOWLIST)[number];

/** Keys that must never appear on agent order/receipt payloads. */
export const AGENT_ORDER_RECEIPT_FORBIDDEN_KEYS = [
  "email",
  "member_email",
  "secret_hash",
  "secret",
  "pan",
  "last4",
  "card",
  "payment_method_id",
  "payment_method",
  "address",
  "address_line",
  "street",
  "phone",
  "household_id",
  "member_id",
  "agent_key_id",
  "receipt_token",
  "charge_id",
  "idempotency_key",
] as const;

export type AgentOrderReceiptInput = {
  orderId: string;
  status: string;
  amountCents: number;
  canonicalItemId: string;
  displayName: string | null;
  fulfillerId: string | null;
  whyThisSeller: {
    landed_cents: number;
    delivery_date: string;
    merchant_score: number;
  } | null;
  jobId: string | null;
  trackingNumber: string | null;
  shipmentEvents: ReadonlyArray<{
    eventId: string;
    status: string;
    trackingNumber: string | null;
    atUtc: string;
  }>;
  receiptUrl: string | null;
};

export type AgentOrderReceipt = {
  order_id: string;
  status: string;
  amount_cents: number;
  canonical_item_id: string;
  display_name: string | null;
  fulfiller_id: string | null;
  why_this_seller: {
    landed_cents: number;
    delivery_date: string;
    merchant_score: number;
  } | null;
  job_id: string | null;
  tracking_number: string | null;
  shipment_events: Array<{
    event_id: string;
    status: string;
    tracking_number: string | null;
    at: string;
  }>;
  receipt_url: string | null;
  summary: string;
};

function agentOrderSummary(input: AgentOrderReceiptInput): string {
  const name = input.displayName ?? input.canonicalItemId;
  const dollars = (input.amountCents / 100).toFixed(2);
  const track = input.trackingNumber
    ? `; tracking ${input.trackingNumber}`
    : "";
  return `Order ${input.orderId}: ${name} — $${dollars} (${input.status})${track}`;
}

/**
 * Unit 16: allowlist-serialize an agent order receipt.
 * Only known keys; unknown fields on the input object are dropped.
 */
export function serializeAgentOrderReceipt(
  input: AgentOrderReceiptInput,
): AgentOrderReceipt {
  const built: AgentOrderReceipt = {
    order_id: input.orderId,
    status: input.status,
    amount_cents: input.amountCents,
    canonical_item_id: input.canonicalItemId,
    display_name: input.displayName,
    fulfiller_id: input.fulfillerId,
    why_this_seller: input.whyThisSeller
      ? {
          landed_cents: input.whyThisSeller.landed_cents,
          delivery_date: input.whyThisSeller.delivery_date,
          merchant_score: input.whyThisSeller.merchant_score,
        }
      : null,
    job_id: input.jobId,
    tracking_number: input.trackingNumber,
    shipment_events: input.shipmentEvents.map((e) => ({
      event_id: e.eventId,
      status: e.status,
      tracking_number: e.trackingNumber,
      at: e.atUtc,
    })),
    receipt_url: input.receiptUrl,
    summary: agentOrderSummary(input),
  };

  const out: Record<string, unknown> = {};
  for (const key of AGENT_ORDER_RECEIPT_ALLOWLIST) {
    out[key] = built[key];
  }
  return out as AgentOrderReceipt;
}

/** True when a payload object contains a forbidden PII / secret key. */
export function agentOrderReceiptHasForbiddenKey(
  payload: Record<string, unknown>,
): boolean {
  const forbidden = new Set<string>(AGENT_ORDER_RECEIPT_FORBIDDEN_KEYS);
  for (const key of Object.keys(payload)) {
    if (forbidden.has(key)) return true;
  }
  return false;
}

/** Keys on payload that are not in the allowlist. */
export function agentOrderReceiptUnknownKeys(
  payload: Record<string, unknown>,
): string[] {
  const allowed = new Set<string>(AGENT_ORDER_RECEIPT_ALLOWLIST);
  return Object.keys(payload).filter((k) => !allowed.has(k));
}
