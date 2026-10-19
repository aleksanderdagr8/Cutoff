import { CommitRequestSchema } from "@cutoff/contracts";
import {
  evaluateRiskGate,
  hasScope,
  isQuoteExpired,
  quoteHashMaterial,
} from "@cutoff/domain";
import { authenticateAgent } from "../auth.js";
import type { ApiBindings } from "../bindings.js";

/**
 * Phase 3 commit: risk gate → mandate re-check → evidence + pay.
 * Charge amount is always the quote landed cents (body cannot raise it).
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

  const quote = bindings.quotes.get(parsed.data.quote_id);
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

  const mandateRow = bindings.mandates.getForHousehold(
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
    bindings.quotes.markCommitted(quote.quoteId, nowUtc);
  }

  return {
    order_id: result.order.orderId,
    household_id: result.order.householdId,
    amount_cents: result.order.amountCents,
    created: result.created,
    status: result.order.status,
    evidence_id: result.evidence.evidenceId,
  };
}
