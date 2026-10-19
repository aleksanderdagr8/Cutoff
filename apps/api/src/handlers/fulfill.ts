import {
  CancelOrderRequestSchema,
  InboundFulfillWebhookSchema,
} from "@cutoff/contracts";
import { canCancelOrder, hasScope } from "@cutoff/domain";
import { authenticateAgent } from "../auth.js";
import type { ApiBindings } from "../bindings.js";

/**
 * After a successful capture: place via FulfillAdapter.
 * Place failure → enqueue refund; never leave captured with no job and no refund.
 * Outbound webhook is queued after the durable write (not inside pay tx).
 */
export async function placeAfterCapture(
  bindings: ApiBindings,
  order: {
    orderId: string;
    householdId: string;
    canonicalItemId: string;
    amountCents: number;
    quoteId: string;
  },
): Promise<
  | { ok: true; jobId: string }
  | { ok: false; refundId: string; error: "place_failed" }
> {
  const nowUtc = bindings.nowUtc();
  const quote = bindings.quotes.get(order.quoteId);
  const fulfillerId = quote?.fulfillerId ?? "unknown";

  try {
    const placed = await bindings.fulfill.place({
      orderId: order.orderId,
      canonicalItemId: order.canonicalItemId,
      qty: 1,
      fulfillerId,
    });
    bindings.fulfillment.recordJob({
      jobId: placed.jobId,
      orderId: order.orderId,
      householdId: order.householdId,
      fulfillerId,
      nowUtc,
    });
    bindings.orders.appendStatus(order.orderId, "placed", nowUtc);

    const body = JSON.stringify({
      type: "order.placed",
      order_id: order.orderId,
      job_id: placed.jobId,
      household_id: order.householdId,
      at: nowUtc,
    });
    bindings.outboundWebhooks.enqueue({
      url: bindings.webhookTargetUrl,
      eventType: "order.placed",
      body,
      createdAtUtc: nowUtc,
    });

    return { ok: true, jobId: placed.jobId };
  } catch {
    const refund = bindings.fulfillment.enqueueRefund({
      orderId: order.orderId,
      amountCents: order.amountCents,
      reason: "place_failed",
      nowUtc,
    });
    return { ok: false, refundId: refund.refundId, error: "place_failed" };
  }
}

/** Agent: fetch tracking / shipment events for an order. */
export async function getOrderTrackingHandler(
  bindings: ApiBindings,
  orderId: string,
  authorization: string | undefined,
) {
  const auth = await authenticateAgent(bindings, authorization);
  if (!auth.ok) {
    return { error: auth.error, status: auth.status };
  }
  if (!hasScope(auth.agent.scopes, "commit") && !hasScope(auth.agent.scopes, "read_list")) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }

  const order = bindings.orders.getForHousehold(
    orderId,
    auth.agent.householdId,
  );
  if (!order) {
    return { error: "mandate_miss" as const, status: 404 as const };
  }

  const job = bindings.fulfillment.getJobForOrder(orderId);
  const events = bindings.fulfillment.listShipmentEvents(orderId);
  const latestTracking =
    [...events].reverse().find((e) => e.trackingNumber)?.trackingNumber ?? null;

  return {
    order_id: order.orderId,
    status: order.status,
    job_id: job?.jobId ?? null,
    tracking_number: latestTracking,
    shipment_events: events.map((e) => ({
      event_id: e.externalEventId,
      status: e.status,
      tracking_number: e.trackingNumber,
      at: e.atUtc,
    })),
  };
}

/** Agent: cancel-before-ship when mandate allows. */
export async function cancelOrderHandler(
  bindings: ApiBindings,
  body: unknown,
  authorization: string | undefined,
) {
  const auth = await authenticateAgent(bindings, authorization);
  if (!auth.ok) {
    return { error: auth.error, status: auth.status };
  }
  if (!hasScope(auth.agent.scopes, "commit")) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }

  const parsed = CancelOrderRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { error: "invalid_body" as const, status: 400 as const };
  }

  const order = bindings.orders.getForHousehold(
    parsed.data.order_id,
    auth.agent.householdId,
  );
  if (!order) {
    return { error: "mandate_miss" as const, status: 404 as const };
  }

  const quote = bindings.quotes.get(order.quoteId);
  if (!quote) {
    return { error: "quote_mismatch" as const, status: 400 as const };
  }
  const mandateRow = bindings.mandates.getForHousehold(
    quote.mandateId,
    auth.agent.householdId,
  );
  if (!mandateRow) {
    return { error: "mandate_miss" as const, status: 403 as const };
  }

  const check = canCancelOrder({
    status: order.status,
    allowCancel: mandateRow.allowCancel,
  });
  if (!check.ok) {
    return { error: check.error, status: 403 as const };
  }

  const job = bindings.fulfillment.getJobForOrder(order.orderId);
  if (job) {
    await bindings.fulfill.cancel({
      jobId: job.jobId,
      orderId: order.orderId,
    });
    bindings.fulfillment.markJobCancelled(job.jobId);
  }

  const nowUtc = bindings.nowUtc();
  bindings.fulfillment.enqueueRefund({
    orderId: order.orderId,
    amountCents: order.amountCents,
    reason: "cancel_before_ship",
    nowUtc,
  });
  bindings.orders.appendStatus(order.orderId, "refunded", nowUtc);
  bindings.risk.recordMerchantStrike(
    job?.fulfillerId ?? quote.fulfillerId,
    "cancel",
  );

  return {
    order_id: order.orderId,
    status: "cancelled" as const,
  };
}

/**
 * Inbound fulfiller webhook. Signature verified by caller (edge) before body.
 * Dedupes on event_id; writes shipment_events; late ship → merchant strike.
 */
export async function inboundFulfillWebhookHandler(
  bindings: ApiBindings,
  body: unknown,
  opts: { signatureValid: boolean },
) {
  if (!opts.signatureValid) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }

  const parsed = InboundFulfillWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return { error: "invalid_body" as const, status: 400 as const };
  }

  const order = bindings.orders.get(parsed.data.order_id);
  if (!order) {
    return { error: "mandate_miss" as const, status: 404 as const };
  }

  const quote = bindings.quotes.get(order.quoteId);
  const nowUtc = bindings.nowUtc();

  const result = bindings.fulfillment.ingestInbound({
    externalEventId: parsed.data.event_id,
    orderId: parsed.data.order_id,
    jobId: parsed.data.job_id,
    status: parsed.data.status,
    trackingNumber: parsed.data.tracking_number,
    eventTimestampUtc: parsed.data.occurred_at,
    nowUtc,
    promisedDeliveryDateUtc: quote?.deliveryDateUtc,
  });

  if (!result.ok) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }

  if (result.created) {
    if (parsed.data.status === "shipped") {
      bindings.orders.appendStatus(order.orderId, "shipped", nowUtc);
    } else if (parsed.data.status === "delivered") {
      bindings.orders.appendStatus(order.orderId, "delivered", nowUtc);
    }
    if (result.lateShip && quote) {
      bindings.risk.recordMerchantStrike(quote.fulfillerId, "late_ship");
    }

    const outBody = JSON.stringify({
      type: `order.${parsed.data.status}`,
      order_id: order.orderId,
      event_id: parsed.data.event_id,
      tracking_number: parsed.data.tracking_number,
      at: nowUtc,
    });
    bindings.outboundWebhooks.enqueue({
      url: bindings.webhookTargetUrl,
      eventType: `order.${parsed.data.status}`,
      body: outBody,
      createdAtUtc: nowUtc,
    });
  }

  return {
    ok: true as const,
    created: result.created,
    event_id: result.event.externalEventId,
  };
}
