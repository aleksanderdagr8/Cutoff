import { QuoteRequestSchema } from "@cutoff/contracts";
import { checkMandate, hasScope } from "@cutoff/domain";
import { authenticateAgent } from "../auth.js";
import type { ApiBindings } from "../bindings.js";

/**
 * Phase 1 stub quote. Validates agent auth, scope, and mandate.
 * Catalog/offer ranking arrives in Unit 6 — amount_cents is caller-supplied
 * only so ceiling checks are testable without a catalog.
 */
export async function quoteHandler(
  bindings: ApiBindings,
  body: unknown,
  authorization: string | undefined,
) {
  const auth = await authenticateAgent(bindings, authorization);
  if (!auth.ok) {
    return { error: auth.error, status: auth.status };
  }
  if (!hasScope(auth.agent.scopes, "quote")) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }

  const parsed = QuoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { error: "invalid_body" as const, status: 400 as const };
  }

  if (!auth.agent.mandateIds.includes(parsed.data.mandate_id)) {
    return { error: "mandate_miss" as const, status: 403 as const };
  }

  const mandateRow = bindings.mandates.getForHousehold(
    parsed.data.mandate_id,
    auth.agent.householdId,
  );
  if (!mandateRow) {
    return { error: "mandate_miss" as const, status: 403 as const };
  }

  const snapshot = bindings.mandates.toSnapshot(mandateRow);
  const nowUtc = bindings.nowUtc();
  const check = checkMandate({
    mandate: snapshot,
    canonicalItemId: parsed.data.canonical_item_id,
    amountCents: parsed.data.amount_cents,
    addressId: snapshot.addressId,
    nowUtc,
  });
  if (!check.ok) {
    return { error: check.error, status: 403 as const };
  }

  const quote = bindings.quotes.create({
    householdId: auth.agent.householdId,
    mandateId: mandateRow.mandateId,
    agentKeyId: auth.agent.keyId,
    canonicalItemId: parsed.data.canonical_item_id,
    amountCents: parsed.data.amount_cents,
    ceilingCents: mandateRow.ceilingCents,
    addressId: mandateRow.addressId,
    nowUtc,
  });

  return {
    quote_id: quote.quoteId,
    expires_at: quote.expiresAtUtc,
    landed_cents: quote.amountCents,
    mandate_id: quote.mandateId,
    canonical_item_id: quote.canonicalItemId,
    ceiling_cents: quote.ceilingCents,
  };
}
