import { CommitRequestSchema } from "@cutoff/contracts";
import {
  evaluateRiskGate,
  hasScope,
  isQuoteExpired,
  quoteHashMaterial,
} from "@cutoff/domain";
import { authenticateAgent } from "../auth.js";
import type { ApiBindings } from "../bindings.js";
import { placeAfterCapture } from "./fulfill.js";

/**
 * Phase 3–4 commit: risk gate → mandate re-check → evidence + pay → place.
 * Charge amount is always the quote landed cents (body cannot raise it).
 * Place goes through bindings (commit must not import fulfill adapters).
 */
export async function commitHandler(
  bindings: ApiBindings,
  body: unknown,
  opts: {
    authorization: string | undefined;
    idempotencyKey: string | undefined;
  },
) {
  const auth = await authenticateAgent(bindings, opts.authorization);
  if (!auth.ok) {
    return { error: auth.error, status: auth.status };
  }
  if (!hasScope(auth.agent.scopes, "commit")) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }
  if (!opts.idempotencyKey) {
    return { error: "invalid_body" as const, status: 400 as const };
  }

  const parsed = CommitRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { error: "invalid_body" as const, status: 400 as const };
  }

  const quote = await bindings.quotes.get(parsed.data.quote_id);
  if (!quote || quote.householdId !== auth.agent.householdId) {
    return { error: "quote_mismatch" as const, status: 400 as const };
  }
  if (quote.agentKeyId !== auth.agent.keyId) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }

  const nowUtc = bindings.nowUtc();
  if (isQuoteExpired(quote.expiresAtUtc, nowUtc)) {
    return { error: "quote_expired" as const, status: 400 as const };
  }

  const mandateRow = await bindings.mandates.getForHousehold(
    quote.mandateId,
    auth.agent.householdId,
  );
  if (!mandateRow) {
    return { error: "mandate_miss" as const, status: 403 as const };
  }

  const mandate = bindings.mandates.toSnapshot(mandateRow);

  const keyAgeMs = Math.max(
    0,
    Date.parse(nowUtc) - Date.parse(auth.agent.createdAt),
  );

  const risk = evaluateRiskGate({
    killSwitch: bindings.risk.killSwitch,
    addressId: quote.addressId,
    mandateAddressId: mandate.addressId,
    merchantSuspended: bindings.risk.isMerchantSuspended(quote.fulfillerId),
    commitsInLastHour: bindings.risk.commitsInLastHour(
      auth.agent.householdId,
      nowUtc,
    ),
    keyAgeMs,
  });
  if (!risk.ok) {
    return { error: risk.error, status: 403 as const };
  }

  // Prove mutated body cannot raise the charge: ignore any client amount.
  const amountCents = quote.landedCents;

  const result = await bindings.orders.commitWithEvidence({
    householdId: auth.agent.householdId,
    canonicalItemId: quote.canonicalItemId,
    quoteId: quote.quoteId,
    amountCents,
    idempotencyKey: opts.idempotencyKey,
    mandate,
    addressId: quote.addressId,
    nowUtc,
    actorChain: parsed.data.actor_chain,
    protocol: parsed.data.protocol,
    agentKeyId: auth.agent.keyId,
    mandateId: quote.mandateId,
    quoteHashMaterial: quoteHashMaterial({
      quoteId: quote.quoteId,
      landedCents: quote.landedCents,
      taxCents: quote.taxCents,
      fulfillerId: quote.fulfillerId,
      canonicalItemId: quote.canonicalItemId,
      deliveryDateUtc: quote.deliveryDateUtc,
    }),
  });

  if (!result.ok) {
    return { error: result.error, status: 403 as const };
  }

  // Velocity counts successful commit attempts that passed the gate.
  if (result.created) {
    bindings.risk.recordCommit(auth.agent.householdId, nowUtc);
  }

  if (result.created && result.order.status !== "failed") {
    await bindings.quotes.markCommitted(quote.quoteId, nowUtc);
  }

  // Phase 4: place after capture. Failure enqueues refund (no bare captured).
  let status = result.order.status;
  let jobId: string | undefined;
  let refundId: string | undefined;
  if (result.created && result.order.status === "captured") {
    const placed = await placeAfterCapture(bindings, {
      orderId: result.order.orderId,
      householdId: result.order.householdId,
      canonicalItemId: result.order.canonicalItemId,
      amountCents: result.order.amountCents,
      quoteId: result.order.quoteId,
    });
    if (placed.ok) {
      jobId = placed.jobId;
      status = "placed";
    } else {
      refundId = placed.refundId;
      // Stay captured but refund queued — not a silent stranded capture.
    }
  } else if (!result.created && result.order.status === "placed") {
    const job = bindings.fulfillment.getJobForOrder(result.order.orderId);
    jobId = job?.jobId;
    status = result.order.status;
  }

  // Unit 10: receipt token for the cardholder charge-descriptor link.
  let receiptToken: string | undefined;
  if (result.order.status !== "failed") {
    const receipt = bindings.receipts.issue({
      orderId: result.order.orderId,
      householdId: result.order.householdId,
      nowUtc,
    });
    receiptToken = receipt.receiptToken;
  }

  // Unit 11/14: update matching list line last_order + next_due_at.
  if (result.created && result.order.status !== "failed") {
    const lines = await bindings.list.listForHousehold(
      result.order.householdId,
    );
    const line = lines.find(
      (l) => l.canonicalItemId === result.order.canonicalItemId,
    );
    if (line) {
      await bindings.list.recordOrder(
        line.lineId,
        result.order.orderId,
        nowUtc,
      );
    }
  }

  return {
    order_id: result.order.orderId,
    household_id: result.order.householdId,
    amount_cents: result.order.amountCents,
    created: result.created,
    status,
    evidence_id: result.evidence.evidenceId,
    ...(jobId ? { job_id: jobId } : {}),
    ...(refundId ? { refund_id: refundId } : {}),
    ...(receiptToken ? { receipt_token: receiptToken } : {}),
  };
}
