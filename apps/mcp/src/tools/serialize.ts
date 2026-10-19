/**
 * Allowlist serializers for MCP tool outputs (no PII / payment / address).
 */

type Json = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function pickLine(raw: Json) {
  return {
    line_id: str(raw.line_id),
    canonical_item_id: str(raw.canonical_item_id),
    display_name: str(raw.display_name),
    cadence_hint_days: num(raw.cadence_hint_days),
    next_due_at: str(raw.next_due_at),
    paused: bool(raw.paused) ?? false,
    never_substitute: bool(raw.never_substitute) ?? false,
    mandate_id: str(raw.mandate_id),
  };
}

export function serializeList(body: Json) {
  const linesRaw = Array.isArray(body.lines) ? body.lines : [];
  const lines = linesRaw
    .filter((l): l is Json => !!l && typeof l === "object")
    .map(pickLine);
  const summary =
    lines.length === 0
      ? "Household list is empty."
      : `Household list: ${lines.length} line(s).`;
  return { lines, summary };
}

export function serializeDueList(body: Json) {
  const linesRaw = Array.isArray(body.lines) ? body.lines : [];
  const lines = linesRaw
    .filter((l): l is Json => !!l && typeof l === "object")
    .map((raw) => ({
      ...pickLine(raw),
      reason: str(raw.reason),
      nudge_id: str(raw.nudge_id),
    }));
  const within = num(body.within_days) ?? 7;
  const summary =
    lines.length === 0
      ? `No lines due within ${within} day(s).`
      : `${lines.length} line(s) due within ${within} day(s).`;
  return { within_days: within, lines, summary };
}

export function serializeQuote(body: Json) {
  const landed = num(body.landed_cents) ?? 0;
  const quoteId = str(body.quote_id) ?? "";
  const delivery = str(body.delivery_date) ?? "";
  return {
    quote_id: quoteId,
    expires_at: str(body.expires_at),
    landed_cents: landed,
    tax_cents: num(body.tax_cents),
    delivery_date: delivery,
    ceiling_cents: num(body.ceiling_cents),
    substitute: body.substitute ?? null,
    summary: `Quote ${quoteId}: ${landed}¢ landed, deliver by ${delivery}.`,
  };
}

export function serializeReorderQuote(body: Json) {
  const landed = num(body.landed_cents) ?? 0;
  const quoteId = str(body.quote_id) ?? "";
  return {
    quote_id: quoteId,
    expires_at: str(body.expires_at),
    landed_cents: landed,
    list_line_id: str(body.list_line_id),
    fulfiller_id: str(body.fulfiller_id),
    nudge_id: str(body.nudge_id),
    tax_cents: null,
    delivery_date: null,
    ceiling_cents: null,
    substitute: null,
    summary: `Reorder quote ${quoteId}: ${landed}¢ landed.`,
  };
}

export function serializeCommit(body: Json) {
  const orderId = str(body.order_id) ?? "";
  const status = str(body.status) ?? "";
  const amount = num(body.amount_cents) ?? 0;
  return {
    order_id: orderId,
    status,
    amount_cents: amount,
    receipt_token: str(body.receipt_token),
    evidence_id: str(body.evidence_id),
    created: bool(body.created),
    summary: `Order ${orderId} ${status} for ${amount}¢.`,
  };
}

export function serializeReceipt(order: Json, evidence: Json | null) {
  const orderId = str(order.order_id) ?? "";
  const status = str(order.status) ?? "";
  const summary =
    str(order.summary) ?? `Order ${orderId} status ${status}.`;
  const events = Array.isArray(order.shipment_events)
    ? order.shipment_events
        .filter((e): e is Json => !!e && typeof e === "object")
        .map((e) => ({
          event_id: str(e.event_id),
          status: str(e.status),
          tracking_number: str(e.tracking_number),
          at: str(e.at),
        }))
    : [];

  return {
    order_id: orderId,
    status,
    amount_cents: num(order.amount_cents),
    canonical_item_id: str(order.canonical_item_id),
    display_name: str(order.display_name),
    why_this_seller: order.why_this_seller ?? null,
    shipment_events: events,
    receipt_url: str(order.receipt_url),
    evidence_id: evidence ? str(evidence.evidence_id) : null,
    protocol: evidence ? str(evidence.protocol) : null,
    actor_chain: evidence && Array.isArray(evidence.actor_chain)
      ? evidence.actor_chain.filter((x): x is string => typeof x === "string")
      : null,
    summary,
  };
}

export function serializeSkip(body: Json) {
  const lineId = str(body.line_id) ?? "";
  const paused = bool(body.paused) ?? false;
  const nextDue = str(body.next_due_at);
  return {
    line_id: lineId,
    mode: str(body.mode),
    paused,
    next_due_at: nextDue,
    snoozed_until: str(body.snoozed_until),
    summary: paused
      ? `Line ${lineId} paused.`
      : `Line ${lineId} next due ${nextDue ?? "unset"}.`,
  };
}

export function serializeCancel(body: Json) {
  const orderId = str(body.order_id) ?? "";
  const status = str(body.status) ?? "cancelled";
  return {
    order_id: orderId,
    status,
    summary: `Order ${orderId} ${status}.`,
  };
}
