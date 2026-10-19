/**
 * Unit 12: exportable evidence pack per order.
 * Agent with commit or read_list may fetch the pack for its household.
 */

import { assembleEvidencePack, hasScope } from "@cutoff/domain";
import { authenticateAgent } from "../auth.js";
import type { ApiBindings } from "../bindings.js";

export async function getEvidencePackHandler(
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

  const order = bindings.orders.getForHousehold(
    orderId,
    auth.agent.householdId,
  );
  if (!order) {
    return { error: "mandate_miss" as const, status: 404 as const };
  }

  const evidence = bindings.orders.getEvidence(order.orderId);
  if (!evidence) {
    return { error: "mandate_miss" as const, status: 404 as const };
  }

  const quote = bindings.quotes.get(order.quoteId);
  if (!quote) {
    return { error: "quote_mismatch" as const, status: 400 as const };
  }

  const assembled = assembleEvidencePack({
    orderId: order.orderId,
    evidenceId: evidence.evidenceId,
    actorChain: evidence.actorChain,
    protocol: evidence.protocol,
    agentKeyId: evidence.agentKeyId,
    mandateId: evidence.mandateId,
    quoteHash: evidence.quoteHash,
    addressId: evidence.addressId,
    amountCents: evidence.amountCents,
    fulfillerId: quote.fulfillerId,
    quoteId: quote.quoteId,
    canonicalItemId: quote.canonicalItemId,
    rankInputs: {
      landedCents: quote.scoreInputs.landedCents,
      deliveryDateUtc: quote.scoreInputs.deliveryDateUtc,
      merchantScore: quote.scoreInputs.merchantScore,
    },
  });

  if (!assembled.ok) {
    return { error: assembled.error, status: 403 as const };
  }

  const pack = assembled.pack;
  return {
    order_id: pack.orderId,
    evidence_id: pack.evidenceId,
    actor_chain: pack.actorChain,
    protocol: pack.protocol,
    agent_key_id: pack.agentKeyId,
    mandate_id: pack.mandateId,
    quote_hash: pack.quoteHash,
    address_id: pack.addressId,
    amount_cents: pack.amountCents,
    fulfiller_id: pack.fulfillerId,
    quote_id: pack.quoteId,
    canonical_item_id: pack.canonicalItemId,
    rank_inputs: {
      landed_cents: pack.rankInputs.landedCents,
      delivery_date: pack.rankInputs.deliveryDateUtc,
      merchant_score: pack.rankInputs.merchantScore,
    },
  };
}
