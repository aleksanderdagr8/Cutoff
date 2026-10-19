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
