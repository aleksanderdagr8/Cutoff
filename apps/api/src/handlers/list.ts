import {
  ReorderRequestSchema,
  SkipListLineRequestSchema,
  UpsertListLineRequestSchema,
} from "@cutoff/contracts";
import {
  checkMandate,
  classifyOffersForQuote,
  hasBannedReorderField,
  hasScope,
  pickWinner,
  quoteAmountsForPack,
  stickyFulfillerForReorder,
  type OfferCandidate,
} from "@cutoff/domain";
import type { OfferRow } from "@cutoff/db";
import { authenticateAgent } from "../auth.js";
import type { ApiBindings } from "../bindings.js";

function toCandidate(row: OfferRow): OfferCandidate {
  return {
    offerId: row.offerId,
    fulfillerId: row.fulfillerId,
    priceCents: row.priceCents,
    taxCents: row.taxCents,
    landedCents: row.priceCents + row.taxCents,
    deliveryDateUtc: row.deliveryDateUtc,
    merchantScore: row.merchantScore,
    inStock: row.inStock,
    freshUntilUtc: row.freshUntilUtc,
  };
}

function linePayload(line: {
  lineId: string;
  canonicalItemId: string;
  cadenceHintDays: number | null;
  neverSubstitute: boolean;
  lastQuoteId: string | null;
  lastOrderId: string | null;
  paused: boolean;
  mandateId: string;
}) {
  return {
    line_id: line.lineId,
    canonical_item_id: line.canonicalItemId,
    cadence_hint_days: line.cadenceHintDays,
    never_substitute: line.neverSubstitute,
    last_quote_id: line.lastQuoteId,
    last_order_id: line.lastOrderId,
    paused: line.paused,
    mandate_id: line.mandateId,
  };
}

/** Agent with `read_list` reads the household list. */
export async function getListHandler(
  bindings: ApiBindings,
  authorization: string | undefined,
) {
  const auth = await authenticateAgent(bindings, authorization);
  if (!auth.ok) {
    return { error: auth.error, status: auth.status };
  }
  if (!hasScope(auth.agent.scopes, "read_list")) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }

  const lines = bindings.list.listForHousehold(auth.agent.householdId);
  return {
    household_id: auth.agent.householdId,
    lines: lines.map(linePayload),
  };
}

/** Human/service path: upsert a list line for the household. */
export async function upsertListLineHandler(
  bindings: ApiBindings,
  householdId: string,
  body: unknown,
) {
  const parsed = UpsertListLineRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { error: "invalid_body" as const, status: 400 as const };
  }

  const mandate = bindings.mandates.getForHousehold(
    parsed.data.mandate_id,
    householdId,
  );
  if (!mandate) {
    return { error: "mandate_miss" as const, status: 403 as const };
  }

  const line = bindings.list.upsert({
    householdId,
    mandateId: parsed.data.mandate_id,
    canonicalItemId: parsed.data.canonical_item_id,
    cadenceHintDays: parsed.data.cadence_hint_days ?? null,
    neverSubstitute: parsed.data.never_substitute ?? false,
    nowUtc: bindings.nowUtc(),
  });

  return linePayload(line);
}

/**
 * Unit 11 reorder: re-quote every cycle. Previous fulfiller is not sticky.
 * Sensor / image / weight fields are rejected by schema.
 */
export async function reorderHandler(
  bindings: ApiBindings,
  body: unknown,
  authorization: string | undefined,
) {
  const auth = await authenticateAgent(bindings, authorization);
  if (!auth.ok) {
    return { error: auth.error, status: auth.status };
  }
  if (
    !hasScope(auth.agent.scopes, "quote") ||
    !hasScope(auth.agent.scopes, "read_list")
  ) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }

  if (
    body &&
    typeof body === "object" &&
    hasBannedReorderField(body as Record<string, unknown>)
  ) {
    return { error: "invalid_body" as const, status: 400 as const };
  }

  const parsed = ReorderRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { error: "invalid_body" as const, status: 400 as const };
  }

  const line = bindings.list.getForHousehold(
    parsed.data.list_line_id,
    auth.agent.householdId,
  );
  if (!line) {
    return { error: "mandate_miss" as const, status: 404 as const };
  }
  if (line.paused) {
    return { error: "mandate_miss" as const, status: 403 as const };
  }

  if (!auth.agent.mandateIds.includes(line.mandateId)) {
    return { error: "mandate_miss" as const, status: 403 as const };
  }

  const mandateRow = bindings.mandates.getForHousehold(
    line.mandateId,
    auth.agent.householdId,
  );
  if (!mandateRow) {
    return { error: "mandate_miss" as const, status: 403 as const };
  }

  const snapshot = bindings.mandates.toSnapshot(mandateRow);
  const nowUtc = bindings.nowUtc();

  const itemGate = checkMandate({
    mandate: snapshot,
    canonicalItemId: line.canonicalItemId,
    amountCents: 0,
    addressId: snapshot.addressId,
    nowUtc,
  });
  if (!itemGate.ok && itemGate.error === "mandate_miss") {
    return { error: "mandate_miss" as const, status: 403 as const };
  }

  // Explicitly discard last winner — reorder is not sticky.
  void stickyFulfillerForReorder(
    bindings.quotes.get(line.lastQuoteId ?? "")?.fulfillerId ?? null,
  );

  const item = bindings.catalog.getQuotable(line.canonicalItemId);
  if (!item) {
    return { error: "out_of_stock" as const, status: 409 as const };
  }

  const classified = classifyOffersForQuote(
    bindings.offers.listForItem(item.canonicalItemId).map(toCandidate),
    nowUtc,
  );
  if (classified.kind === "stale_only") {
    return { error: "stale_offer" as const, status: 409 as const };
  }
  if (classified.kind !== "fresh") {
    return { error: "out_of_stock" as const, status: 409 as const };
  }
  const winner = pickWinner(classified.offers);
  if (!winner) {
    return { error: "out_of_stock" as const, status: 409 as const };
  }

  const amounts = quoteAmountsForPack(
    winner,
    item.packCount,
    parsed.data.qty,
  );

  const ceilingCheck = checkMandate({
    mandate: snapshot,
    canonicalItemId: line.canonicalItemId,
    category: item.category,
    amountCents: amounts.landedCents,
    addressId: snapshot.addressId,
    nowUtc,
  });
  if (!ceilingCheck.ok) {
    return { error: ceilingCheck.error, status: 403 as const };
  }

  const created = bindings.quotes.create({
    householdId: auth.agent.householdId,
    mandateId: line.mandateId,
    agentKeyId: auth.agent.keyId,
    canonicalItemId: line.canonicalItemId,
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
  });

  if (!created.ok) {
    if (created.error === "hold_active") {
      return {
        error: "hold_active" as const,
        status: 409 as const,
        quote_id: created.quoteId,
      };
    }
    return { error: "invalid_body" as const, status: 400 as const };
  }

  bindings.list.recordQuote(line.lineId, created.quote.quoteId);

  return {
    list_line_id: line.lineId,
    quote_id: created.quote.quoteId,
    fulfiller_id: created.quote.fulfillerId,
    landed_cents: created.quote.landedCents,
    expires_at: created.quote.expiresAtUtc,
  };
}

/** Skip: pause the line; do not place. */
export async function skipListLineHandler(
  bindings: ApiBindings,
  body: unknown,
  authorization: string | undefined,
) {
  const auth = await authenticateAgent(bindings, authorization);
  if (!auth.ok) {
    return { error: auth.error, status: auth.status };
  }
  if (!hasScope(auth.agent.scopes, "read_list")) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }

  const parsed = SkipListLineRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { error: "invalid_body" as const, status: 400 as const };
  }

  const line = bindings.list.getForHousehold(
    parsed.data.list_line_id,
    auth.agent.householdId,
  );
  if (!line) {
    return { error: "mandate_miss" as const, status: 404 as const };
  }

  const skipped = bindings.list.skip(line.lineId);
  if (!skipped) {
    return { error: "mandate_miss" as const, status: 404 as const };
  }

  return {
    line_id: skipped.lineId,
    paused: true as const,
  };
}
