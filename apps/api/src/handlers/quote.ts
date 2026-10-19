import { QuoteRequestSchema } from "@cutoff/contracts";
import {
  checkMandate,
  hasScope,
  quoteAmountsForPack,
  type OfferCandidate,
} from "@cutoff/domain";
import type { CanonicalItemRow } from "@cutoff/db";
import { authenticateAgent } from "../auth.js";
import type { ApiBindings } from "../bindings.js";
import { rankedCandidatesForItem } from "../offer-select.js";

function dayDelta(a: string, b: string): number {
  const ms = Date.parse(b) - Date.parse(a);
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function selectForItem(
  bindings: ApiBindings,
  item: CanonicalItemRow,
  nowUtc: string,
):
  | { ok: true; winner: OfferCandidate; item: CanonicalItemRow }
  | { ok: false; error: "stale_offer" | "out_of_stock" } {
  const ranked = rankedCandidatesForItem(
    bindings,
    item.canonicalItemId,
    nowUtc,
  );
  if (!ranked.ok) return ranked;
  return { ok: true, winner: ranked.winner, item };
}

/**
 * Phase 2–6 quote: catalog + multi-source offers → one immutable winner.
 * Merchant scores and suspend filter applied at rank time (Unit 12).
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

  const mandateRow = await bindings.mandates.getForHousehold(
    parsed.data.mandate_id,
    auth.agent.householdId,
  );
  if (!mandateRow) {
    return { error: "mandate_miss" as const, status: 403 as const };
  }

  const snapshot = bindings.mandates.toSnapshot(mandateRow);
  const nowUtc = bindings.nowUtc();
  const requestedId = parsed.data.canonical_item_id;

  // Item must be on the mandate before we spend ranking work.
  const itemGate = checkMandate({
    mandate: snapshot,
    canonicalItemId: requestedId,
    amountCents: 0,
    addressId: snapshot.addressId,
    nowUtc,
  });
  if (!itemGate.ok && itemGate.error === "mandate_miss") {
    return { error: "mandate_miss" as const, status: 403 as const };
  }

  const primary = bindings.catalog.getQuotable(requestedId);
  if (!primary) {
    // Missing or recalled.
    return { error: "out_of_stock" as const, status: 409 as const };
  }

  let selected = selectForItem(bindings, primary, nowUtc);
  let substitute: {
    fromCanonicalItemId: string;
    toCanonicalItemId: string;
    packCountDelta: number;
    brandFrom: string;
    brandTo: string;
    priceDeltaCents: number;
    dayDelta: number;
    formulaFlag: string | null;
  } | null = null;

  if (!selected.ok) {
    if (selected.error === "stale_offer") {
      return { error: "stale_offer" as const, status: 409 as const };
    }

    const neverSub = snapshot.neverSubstituteIds.includes(requestedId);
    if (neverSub) {
      return { error: "out_of_stock" as const, status: 409 as const };
    }

    // Try equivalence substitutes (exact id out, line allows sub).
    let subFound:
      | { winner: OfferCandidate; item: CanonicalItemRow }
      | null = null;
    for (const alt of bindings.catalog.substitutesFor(requestedId)) {
      const altSel = selectForItem(bindings, alt, nowUtc);
      if (altSel.ok) {
        subFound = { winner: altSel.winner, item: altSel.item };
        break;
      }
    }
    if (!subFound) {
      return { error: "out_of_stock" as const, status: 409 as const };
    }

    substitute = {
      fromCanonicalItemId: requestedId,
      toCanonicalItemId: subFound.item.canonicalItemId,
      packCountDelta: subFound.item.packCount - primary.packCount,
      brandFrom: primary.brand,
      brandTo: subFound.item.brand,
      priceDeltaCents: subFound.winner.landedCents,
      dayDelta: dayDelta(parsed.data.deliver_by, subFound.winner.deliveryDateUtc),
      formulaFlag: subFound.item.formulaFlags[0] ?? null,
    };
    selected = {
      ok: true,
      winner: subFound.winner,
      item: subFound.item,
    };
  }

  // After the branch above, selected is always ok.
  const winner = selected.ok ? selected.winner : null;
  const quotedItem = selected.ok ? selected.item : null;
  if (!winner || !quotedItem) {
    return { error: "out_of_stock" as const, status: 409 as const };
  }

  const amounts = quoteAmountsForPack(
    winner,
    quotedItem.packCount,
    parsed.data.qty,
  );

  const ceilingCheck = checkMandate({
    mandate: snapshot,
    canonicalItemId: requestedId,
    category: primary.category,
    amountCents: amounts.landedCents,
    addressId: snapshot.addressId,
    nowUtc,
  });
  if (!ceilingCheck.ok) {
    return { error: ceilingCheck.error, status: 403 as const };
  }

  const created = await bindings.quotes.create({
    householdId: auth.agent.householdId,
    mandateId: mandateRow.mandateId,
    agentKeyId: auth.agent.keyId,
    canonicalItemId: quotedItem.canonicalItemId,
    qty: parsed.data.qty,
    landedCents: amounts.landedCents,
    taxCents: amounts.taxCents,
    unitPriceCents: amounts.unitPriceCents,
    deliveryDateUtc: winner.deliveryDateUtc,
    fulfillerId: winner.fulfillerId,
    offerId: winner.offerId,
    scoreInputs: {
      landedCents: winner.landedCents,
      deliveryDateUtc: winner.deliveryDateUtc,
      merchantScore: winner.merchantScore,
    },
    addressId: mandateRow.addressId,
    ceilingCents: mandateRow.ceilingCents,
    nowUtc,
    substitute,
  });

  if (!created.ok) {
    if (created.error === "hold_active") {
      return {
        error: "hold_active" as const,
        quote_id: created.quoteId,
        status: 409 as const,
      };
    }
    return { error: "invalid_body" as const, status: 400 as const };
  }

  const quote = created.quote;
  return {
    quote_id: quote.quoteId,
    expires_at: quote.expiresAtUtc,
    landed_cents: quote.landedCents,
    tax_cents: quote.taxCents,
    unit_price_cents: quote.unitPriceCents,
    delivery_date: quote.deliveryDateUtc,
    fulfiller_id: quote.fulfillerId,
    mandate_id: quote.mandateId,
    canonical_item_id: quote.canonicalItemId,
    ceiling_cents: quote.ceilingCents,
    score_inputs: {
      landed_cents: quote.scoreInputs.landedCents,
      delivery_date: quote.scoreInputs.deliveryDateUtc,
      merchant_score: quote.scoreInputs.merchantScore,
    },
    substitute: quote.substitute
      ? {
          from_canonical_item_id: quote.substitute.fromCanonicalItemId,
          to_canonical_item_id: quote.substitute.toCanonicalItemId,
          pack_count_delta: quote.substitute.packCountDelta,
          brand_from: quote.substitute.brandFrom,
          brand_to: quote.substitute.brandTo,
          price_delta_cents: quote.substitute.priceDeltaCents,
          day_delta: quote.substitute.dayDelta,
          formula_flag: quote.substitute.formulaFlag,
        }
      : null,
  };
}
