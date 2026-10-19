import { canViewReceipt, receiptSkipAction, whyThisSeller } from "@cutoff/domain";
import type { ApiBindings } from "../bindings.js";
import { cancelOrderHandler } from "./fulfill.js";

function memberSession(opts: {
  memberId?: string;
  memberHouseholdId?: string;
}) {
  if (opts.memberId && opts.memberHouseholdId) {
    return {
      role: "member" as const,
      memberId: opts.memberId,
      householdId: opts.memberHouseholdId,
    };
  }
  return { role: "anon" as const };
}

/**
 * Unit 10: human opens receipt from charge-descriptor link.
 * Member session only — works even when the agent key is revoked.
 */
export async function getReceiptHandler(
  bindings: ApiBindings,
  receiptToken: string,
  opts: {
    memberId?: string;
    memberHouseholdId?: string;
  },
) {
  const receipt = bindings.receipts.getByToken(receiptToken);
  if (!receipt) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }

  const session = memberSession(opts);
  if (!canViewReceipt(session, receipt.householdId)) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }

  // RLS-shaped household membership double-check.
  if (
    session.role === "member" &&
    !await bindings.households.memberOf(session.memberId!, receipt.householdId)
  ) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }

  const order = await bindings.orders.getForHousehold(
    receipt.orderId,
    receipt.householdId,
  );
  if (!order) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }

  const quote = await bindings.quotes.get(order.quoteId);
  if (!quote) {
    return { error: "quote_mismatch" as const, status: 400 as const };
  }

  const item = bindings.catalog.get(order.canonicalItemId);
  const skip = receiptSkipAction(order.status);

  return {
    receipt_token: receipt.receiptToken,
    order_id: order.orderId,
    household_id: order.householdId,
    item: {
      canonical_item_id: order.canonicalItemId,
      description: item?.description ?? order.canonicalItemId,
      brand: item?.brand ?? "",
    },
    landed_cents: order.amountCents,
    fulfiller_id: quote.fulfillerId,
    why_this_seller: whyThisSeller({
      landedCents: quote.scoreInputs.landedCents,
      deliveryDateUtc: quote.scoreInputs.deliveryDateUtc,
      merchantScore: quote.scoreInputs.merchantScore,
    }),
    status: order.status,
    skip_available: skip !== "none",
  };
}

/**
 * Receipt skip: one call, no retention interstitial.
 * Before ship → cancel. After ship → return request.
 */
export async function skipReceiptHandler(
  bindings: ApiBindings,
  receiptToken: string,
  opts: {
    memberId?: string;
    memberHouseholdId?: string;
    /** When canceling, human path uses service-role cancel via mandate. */
    agentAuthorization?: string;
  },
) {
  const receipt = bindings.receipts.getByToken(receiptToken);
  if (!receipt) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }

  const session = memberSession(opts);
  if (!canViewReceipt(session, receipt.householdId)) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }
  if (
    session.role === "member" &&
    !await bindings.households.memberOf(session.memberId!, receipt.householdId)
  ) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }

  const order = await bindings.orders.getForHousehold(
    receipt.orderId,
    receipt.householdId,
  );
  if (!order) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }

  const action = receiptSkipAction(order.status);
  if (action === "none") {
    return { error: "not_cancellable" as const, status: 403 as const };
  }

  if (action === "return_request") {
    const ret = bindings.fulfillment.openReturnRequest({
      orderId: order.orderId,
      householdId: order.householdId,
      nowUtc: bindings.nowUtc(),
    });
    return {
      order_id: order.orderId,
      action: "return_request" as const,
      status: "return_open",
      return_id: ret.returnId,
    };
  }

  // cancel before ship — human skip uses the same cancel rules via agent
  // when provided; otherwise direct cancel for member (mandate allow_cancel
  // is not required for the cardholder's own skip).
  if (opts.agentAuthorization) {
    const cancelled = await cancelOrderHandler(
      bindings,
      { order_id: order.orderId },
      opts.agentAuthorization,
    );
    if ("error" in cancelled) {
      return cancelled;
    }
    return {
      order_id: order.orderId,
      action: "cancel" as const,
      status: cancelled.status,
    };
  }

  const quote = await bindings.quotes.get(order.quoteId);
  const nowUtc = bindings.nowUtc();
  const job = bindings.fulfillment.getJobForOrder(order.orderId);
  if (job) {
    await bindings.fulfill.cancel({
      jobId: job.jobId,
      orderId: order.orderId,
    });
    bindings.fulfillment.markJobCancelled(job.jobId);
  }
  bindings.fulfillment.enqueueRefund({
    orderId: order.orderId,
    amountCents: order.amountCents,
    reason: "human",
    nowUtc,
  });
  await bindings.orders.appendStatus(order.orderId, "refunded", nowUtc);
  if (quote) {
    bindings.risk.recordMerchantStrike(
      job?.fulfillerId ?? quote.fulfillerId,
      "cancel",
    );
  }

  return {
    order_id: order.orderId,
    action: "cancel" as const,
    status: "cancelled",
  };
}
