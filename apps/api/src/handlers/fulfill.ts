import {
  CancelOrderRequestSchema,
  InboundFulfillWebhookSchema,
} from "@cutoff/contracts";
import {
  canCancelOrder,
  hasScope,
  serializeAgentOrderReceipt,
  whyThisSeller,
} from "@cutoff/domain";
import { authenticateAgent } from "../auth.js";
import type { ApiBindings } from "../bindings.js";

/**
 * Place via FulfillAdapter, then capture when pay is manual.
 * Immediate capture (fake): place failure enqueues a refund.
 * Manual capture: place failure voids the authorization (no held funds).
 * A capture error after the job is recorded is retryable on the order id.
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
  | { ok: false; refundId?: string; error: "place_failed" }
> {
  const nowUtc = bindings.nowUtc();
  const manual = bindings.pay.captureMode === "manual";

  const current = await bindings.orders.get(order.orderId);
  if (current?.status === "failed") {
    return { ok: false, error: "place_failed" };
  }

  // Retry keyed on order id: one job, or the same place_failed refund.
  const existingJob = bindings.fulfillment.getJobForOrder(order.orderId);
  if (existingJob) {
    if (manual) {
      await bindings.orders.captureAuthorizedOrder(order.orderId, nowUtc);
    }
    const afterCapture = await bindings.orders.get(order.orderId);
    if (afterCapture?.status === "captured") {
      await bindings.orders.appendStatus(order.orderId, "placed", nowUtc);
    }
    return { ok: true, jobId: existingJob.jobId };
  }
  const priorRefund = bindings.fulfillment
    .listRefunds(order.orderId)
    .find((refund) => refund.reason === "place_failed");
  if (priorRefund) {
    return {
      ok: false,
      refundId: priorRefund.refundId,
      error: "place_failed",
    };
  }

  const quote = await bindings.quotes.get(order.quoteId);
  const fulfillerId = quote?.fulfillerId ?? "unknown";

  let placed: { jobId: string };
  try {
    placed = await bindings.fulfill.place({
      orderId: order.orderId,
      canonicalItemId: order.canonicalItemId,
      qty: 1,
      fulfillerId,
    });
  } catch {
    if (manual) {
      await bindings.orders.voidAuthorizedOrder(order.orderId, nowUtc);
      return { ok: false, error: "place_failed" };
    }
    const refund = bindings.fulfillment.enqueueRefund({
      orderId: order.orderId,
      amountCents: order.amountCents,
      reason: "place_failed",
      nowUtc,
    });
    bindings.risk.recordScoreEvent({
      fulfillerId,
      kind: "refund",
      orderId: order.orderId,
      atUtc: nowUtc,
      actorId: "system.fulfill",
    });
    return { ok: false, refundId: refund.refundId, error: "place_failed" };
  }

  bindings.fulfillment.recordJob({
    jobId: placed.jobId,
    orderId: order.orderId,
    householdId: order.householdId,
    fulfillerId,
    nowUtc,
  });
  if (manual) {
    // If this throws, the job is already stored. The next commit retries
    // capture on the order id and does not void a hold that may have captured.
    await bindings.orders.captureAuthorizedOrder(order.orderId, nowUtc);
  }
  await bindings.orders.appendStatus(order.orderId, "placed", nowUtc);

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
}

/**
 * Unit 16: agent-readable order receipt summary (allowlisted).
 * Scopes: read_list or commit. Never returns payment/address/email secrets.
 */
export async function getOrderTrackingHandler(
  bindings: ApiBindings,
  orderId: string,
  authorization: string | undefined,
) {
  const auth = await authenticateAgent(bindings, authorization);
  if (!auth.ok) {
    return { error: auth.error, status: auth.status };
  }
  if (
    !hasScope(auth.agent.scopes, "commit") &&
    !hasScope(auth.agent.scopes, "read_list")
  ) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }

  const order = await bindings.orders.getForHousehold(
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

  const quote = await bindings.quotes.get(order.quoteId);
  const item = bindings.catalog.get(order.canonicalItemId);
  const receipt = bindings.receipts.getByOrder(order.orderId);

  return serializeAgentOrderReceipt({
    orderId: order.orderId,
    status: order.status,
    amountCents: order.amountCents,
    canonicalItemId: order.canonicalItemId,
    displayName: item?.description ?? null,
    fulfillerId: quote?.fulfillerId ?? null,
    whyThisSeller: quote
      ? whyThisSeller({
          landedCents: quote.scoreInputs.landedCents,
          deliveryDateUtc: quote.scoreInputs.deliveryDateUtc,
          merchantScore: quote.scoreInputs.merchantScore,
        })
      : null,
    jobId: job?.jobId ?? null,
    trackingNumber: latestTracking,
    shipmentEvents: events.map((e) => ({
      eventId: e.externalEventId,
      status: e.status,
      trackingNumber: e.trackingNumber,
      atUtc: e.atUtc,
    })),
    receiptUrl: receipt
      ? `/home/receipts/${receipt.receiptToken}`
      : null,
  });
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

  const order = await bindings.orders.getForHousehold(
    parsed.data.order_id,
    auth.agent.householdId,
  );
  if (!order) {
    return { error: "mandate_miss" as const, status: 404 as const };
  }

  const quote = await bindings.quotes.get(order.quoteId);
  if (!quote) {
    return { error: "quote_mismatch" as const, status: 400 as const };
  }
  const mandateRow = await bindings.mandates.getForHousehold(
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

  const nowUtc = bindings.nowUtc();
  if (order.chargeId && bindings.pay.refundPayment) {
    const charges = await bindings.orders.listCharges();
    const captured = charges.some((charge) => charge.orderId === order.orderId);
    if (captured) {
      await bindings.pay.refundPayment({
        orderId: order.orderId,
        paymentIntentId: order.chargeId,
        amountCents: order.amountCents,
        idempotencyKey: `${order.orderId}:refund`,
      });
    }
  }

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
    reason: "cancel_before_ship",
    nowUtc,
  });
  await bindings.orders.appendStatus(order.orderId, "refunded", nowUtc);
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

  const order = await bindings.orders.get(parsed.data.order_id);
  if (!order) {
    return { error: "mandate_miss" as const, status: 404 as const };
  }

  const quote = await bindings.quotes.get(order.quoteId);
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
      await bindings.orders.appendStatus(order.orderId, "shipped", nowUtc);
    } else if (parsed.data.status === "delivered") {
      await bindings.orders.appendStatus(order.orderId, "delivered", nowUtc);
    }
    if (result.lateShip && quote) {
      bindings.risk.recordMerchantStrike(quote.fulfillerId, "late_ship");
    } else if (
      parsed.data.status === "delivered" &&
      quote &&
      !result.lateShip
    ) {
      // Unit 12: on-time delivery materializes into merchant_scores.
      bindings.risk.recordScoreEvent({
        fulfillerId: quote.fulfillerId,
        kind: "on_time",
        orderId: order.orderId,
        atUtc: nowUtc,
        actorId: "system.fulfill",
      });
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
