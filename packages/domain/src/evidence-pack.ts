/**
 * Pure evidence pack assembly. No I/O.
 * Unit 12: exportable pack proves who authorized spend and why the seller won.
 */

import type { RankInputs } from "./rank.js";
import { validateEvidenceFields } from "./risk.js";

export type EvidencePack = {
  orderId: string;
  evidenceId: string;
  actorChain: string[];
  protocol: string;
  agentKeyId: string;
  mandateId: string;
  quoteHash: string;
  addressId: string;
  amountCents: number;
  fulfillerId: string;
  quoteId: string;
  canonicalItemId: string;
  rankInputs: RankInputs;
};

export type EvidencePackInput = {
  orderId: string;
  evidenceId: string;
  actorChain: readonly string[];
  protocol: string;
  agentKeyId: string;
  mandateId: string;
  quoteHash: string;
  addressId: string;
  amountCents: number;
  fulfillerId: string;
  quoteId: string;
  canonicalItemId: string;
  rankInputs: RankInputs;
};

export type EvidencePackResult =
  | { ok: true; pack: EvidencePack }
  | { ok: false; error: "mandate_miss" };

/**
 * Assemble an exportable evidence pack. Rejects incomplete evidence fields.
 */
export function assembleEvidencePack(
  input: EvidencePackInput,
): EvidencePackResult {
  const fields = validateEvidenceFields({
    actorChain: input.actorChain,
    protocol: input.protocol,
    agentKeyId: input.agentKeyId,
    mandateId: input.mandateId,
    quoteHash: input.quoteHash,
    addressId: input.addressId,
    amountCents: input.amountCents,
  });
  if (!fields.ok) {
    return { ok: false, error: "mandate_miss" };
  }
  if (!input.orderId || !input.evidenceId || !input.fulfillerId) {
    return { ok: false, error: "mandate_miss" };
  }
  if (!input.quoteId || !input.canonicalItemId) {
    return { ok: false, error: "mandate_miss" };
  }
  if (
    !Number.isInteger(input.rankInputs.landedCents) ||
    !input.rankInputs.deliveryDateUtc
  ) {
    return { ok: false, error: "mandate_miss" };
  }

  return {
    ok: true,
    pack: {
      orderId: input.orderId,
      evidenceId: input.evidenceId,
      actorChain: [...input.actorChain],
      protocol: input.protocol,
      agentKeyId: input.agentKeyId,
      mandateId: input.mandateId,
      quoteHash: input.quoteHash,
      addressId: input.addressId,
      amountCents: input.amountCents,
      fulfillerId: input.fulfillerId,
      quoteId: input.quoteId,
      canonicalItemId: input.canonicalItemId,
      rankInputs: { ...input.rankInputs },
    },
  };
}
