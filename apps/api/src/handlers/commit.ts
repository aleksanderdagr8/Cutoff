import { CommitRequestSchema } from "@cutoff/contracts";
import { hasScope, isQuoteExpired } from "@cutoff/domain";
import { authenticateAgent } from "../auth.js";
import type { ApiBindings } from "../bindings.js";

/**
 * Phase 2 commit path: agent auth + mandate re-check + fake pay.
 * Full evidence/risk/Stripe arrive in Units 7–8. Charge equals quote landed.
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

  const result = await bindings.orders.commitWithMandate({
    householdId: auth.agent.householdId,
    canonicalItemId: quote.canonicalItemId,
    quoteId: quote.quoteId,
    amountCents: quote.landedCents,
    idempotencyKey: opts.idempotencyKey,
    mandate: bindings.mandates.toSnapshot(mandateRow),
    addressId: quote.addressId,
    nowUtc,
  });

  if (!result.ok) {
    return { error: result.error, status: 403 as const };
  }

  bindings.quotes.markCommitted(quote.quoteId, nowUtc);

  return {
    order_id: result.order.orderId,
    household_id: result.order.householdId,
    amount_cents: result.order.amountCents,
    created: result.created,
  };
}
