import {
  ReorderRequestSchema,
  SkipListLineRequestSchema,
  UpsertListLineRequestSchema,
} from "@cutoff/contracts";
import {
  checkMandate,
  computeNextDue,
  hasBannedReorderField,
  hasScope,
  isDueWithin,
  quoteAmountsForPack,
  stickyFulfillerForReorder,
} from "@cutoff/domain";
import { authenticateAgent } from "../auth.js";
import type { ApiBindings } from "../bindings.js";
import { rankedCandidatesForItem } from "../offer-select.js";

const DEFAULT_DUE_WITHIN_DAYS = 7;
const MAX_DUE_WITHIN_DAYS = 365;

function linePayload(
  bindings: ApiBindings,
  line: {
    lineId: string;
    canonicalItemId: string;
    cadenceHintDays: number | null;
    neverSubstitute: boolean;
    lastQuoteId: string | null;
    lastOrderId: string | null;
    lastOrderedAt: string | null;
    paused: boolean;
    mandateId: string;
  },
) {
  const due = computeNextDue({
    paused: line.paused,
    lastOrderedAt: line.lastOrderedAt,
    cadenceHintDays: line.cadenceHintDays,
  });
  const item = bindings.catalog.get(line.canonicalItemId);
  return {
    line_id: line.lineId,
    canonical_item_id: line.canonicalItemId,
    display_name: item?.description ?? null,
    cadence_hint_days: line.cadenceHintDays,
    next_due_at: due.nextDueAt,
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

  const lines = await bindings.list.listForHousehold(auth.agent.householdId);
  return {
    household_id: auth.agent.householdId,
    lines: lines.map((line) => linePayload(bindings, line)),
  };
}

/**
 * Unit 13: lines due or overdue within `within_days` (default 7).
 * Fixed cadence only; paused / no history never appear.
 */
export async function getDueListHandler(
  bindings: ApiBindings,
  authorization: string | undefined,
  withinDaysRaw: string | undefined,
) {
  const auth = await authenticateAgent(bindings, authorization);
  if (!auth.ok) {
    return { error: auth.error, status: auth.status };
  }
  if (!hasScope(auth.agent.scopes, "read_list")) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }

  let withinDays = DEFAULT_DUE_WITHIN_DAYS;
  if (withinDaysRaw !== undefined && withinDaysRaw !== "") {
    const parsed = Number(withinDaysRaw);
    if (
      !Number.isInteger(parsed) ||
      parsed < 0 ||
      parsed > MAX_DUE_WITHIN_DAYS
    ) {
      return { error: "invalid_body" as const, status: 400 as const };
    }
    withinDays = parsed;
  }

  const nowUtc = bindings.nowUtc();
  const lines = await bindings.list.listForHousehold(auth.agent.householdId);
  const dueLines = [];

  for (const line of lines) {
    if (
      line.snoozedUntil != null &&
      Date.parse(line.snoozedUntil) > Date.parse(nowUtc)
    ) {
      continue;
    }
    const due = computeNextDue({
      paused: line.paused,
      lastOrderedAt: line.lastOrderedAt,
      cadenceHintDays: line.cadenceHintDays,
    });
    if (!isDueWithin(due.nextDueAt, nowUtc, withinDays) || due.reason == null) {
      continue;
    }
    dueLines.push({
      ...linePayload(bindings, line),
      reason: due.reason,
      nudge_id: null as string | null,
    });
  }

  dueLines.sort((a, b) => {
    const aMs = Date.parse(a.next_due_at ?? "");
    const bMs = Date.parse(b.next_due_at ?? "");
    return aMs - bMs;
  });

  return {
    household_id: auth.agent.householdId,
    within_days: withinDays,
    lines: dueLines,
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

  const mandate = await bindings.mandates.getForHousehold(
    parsed.data.mandate_id,
    householdId,
  );
  if (!mandate) {
    return { error: "mandate_miss" as const, status: 403 as const };
  }

  const line = await bindings.list.upsert({
    householdId,
    mandateId: parsed.data.mandate_id,
    canonicalItemId: parsed.data.canonical_item_id,
    cadenceHintDays: parsed.data.cadence_hint_days ?? null,
    neverSubstitute: parsed.data.never_substitute ?? false,
    nowUtc: bindings.nowUtc(),
  });

  return linePayload(bindings, line);
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

  const line = await bindings.list.getForHousehold(
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

  let linkedNudgeId: string | undefined;
  if (parsed.data.nudge_id) {
    const nudge = await bindings.reorderNudges.get(parsed.data.nudge_id);
    if (
      !nudge ||
      nudge.householdId !== auth.agent.householdId ||
      nudge.lineId !== line.lineId
    ) {
      return { error: "mandate_miss" as const, status: 404 as const };
    }
    if (nudge.status === "acted" || nudge.status === "skipped") {
      return { error: "invalid_body" as const, status: 400 as const };
    }
    linkedNudgeId = nudge.nudgeId;
  }

  const mandateRow = await bindings.mandates.getForHousehold(
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
    (await bindings.quotes.get(line.lastQuoteId ?? ""))?.fulfillerId ?? null,
  );

  const item = bindings.catalog.getQuotable(line.canonicalItemId);
  if (!item) {
    return { error: "out_of_stock" as const, status: 409 as const };
  }

  const ranked = rankedCandidatesForItem(
    bindings,
    item.canonicalItemId,
    nowUtc,
  );
  if (!ranked.ok) {
    return { error: ranked.error, status: 409 as const };
  }
  const winner = ranked.winner;

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

  const created = await bindings.quotes.create({
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

  await bindings.list.recordQuote(line.lineId, created.quote.quoteId);

  if (linkedNudgeId) {
    await bindings.quoteNudgeLinks.set(created.quote.quoteId, linkedNudgeId);
  }

  return {
    list_line_id: line.lineId,
    quote_id: created.quote.quoteId,
    fulfiller_id: created.quote.fulfillerId,
    landed_cents: created.quote.landedCents,
    expires_at: created.quote.expiresAtUtc,
    ...(linkedNudgeId ? { nudge_id: linkedNudgeId } : {}),
  };
}

/**
 * Unit 15 skip: mode next | snooze | pause (default pause).
 * Pending nudges for the line are marked skipped.
 */
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

  const mode = parsed.data.mode;
  if (mode === "snooze" && parsed.data.until == null) {
    return { error: "invalid_body" as const, status: 400 as const };
  }

  const line = await bindings.list.getForHousehold(
    parsed.data.list_line_id,
    auth.agent.householdId,
  );
  if (!line) {
    return { error: "mandate_miss" as const, status: 404 as const };
  }

  const skipped = await bindings.list.applySkip({
    lineId: line.lineId,
    mode,
    until: parsed.data.until,
    nowUtc: bindings.nowUtc(),
  });
  if (!skipped.ok) {
    if (skipped.error === "not_found") {
      return { error: "mandate_miss" as const, status: 404 as const };
    }
    return { error: "invalid_body" as const, status: 400 as const };
  }

  await bindings.reorderNudges.markPendingSkippedForLine(line.lineId);

  return {
    line_id: skipped.line.lineId,
    mode,
    paused: skipped.line.paused,
    next_due_at: skipped.line.nextDueAt,
    snoozed_until: skipped.line.snoozedUntil,
  };
}
