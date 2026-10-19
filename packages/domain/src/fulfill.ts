/**
 * Pure fulfill / cancel / inbound-event rules. No I/O.
 * Unit 9: the agent can see the bag move; late webhooks cannot double-apply.
 * Error string literals stay aligned with @cutoff/contracts ErrorCode — no import.
 */

export type OrderLifecycleStatus =
  | "committed"
  | "captured"
  | "failed"
  | "placed"
  | "shipped"
  | "delivered"
  | "refunded";

export type CancelFailCode = "not_cancellable" | "mandate_miss";

export type CancelCheckInput = {
  /** Latest order status from the ledger. */
  status: OrderLifecycleStatus;
  /** Mandate allows cancel-before-ship. */
  allowCancel: boolean;
};

export type CancelCheckResult =
  | { ok: true }
  | { ok: false; error: CancelFailCode };

/**
 * Cancel before `shipped` only, and only when the mandate allows cancel.
 * After ship → `not_cancellable`. Mandate denies → `mandate_miss`.
 */
export function canCancelOrder(input: CancelCheckInput): CancelCheckResult {
  if (input.status === "shipped" || input.status === "delivered") {
    return { ok: false, error: "not_cancellable" };
  }
  if (
    input.status === "failed" ||
    input.status === "refunded" ||
    input.status === "committed"
  ) {
    return { ok: false, error: "not_cancellable" };
  }
  if (!input.allowCancel) {
    return { ok: false, error: "mandate_miss" };
  }
  if (input.status !== "captured" && input.status !== "placed") {
    return { ok: false, error: "not_cancellable" };
  }
  return { ok: true };
}

/** Default inbound webhook replay window: 5 minutes. */
export const DEFAULT_WEBHOOK_REPLAY_WINDOW_MS = 5 * 60 * 1000;

export type InboundAcceptResult =
  | { ok: true }
  | { ok: false; reason: "duplicate" | "replay_window" | "bad_timestamp" };

/**
 * Deduped inbound accept: reject unknown/invalid timestamps, stale replays,
 * and event ids already written.
 */
export function acceptInboundShipmentEvent(input: {
  eventId: string;
  eventTimestampUtc: string;
  nowUtc: string;
  seenEventIds: ReadonlySet<string>;
  replayWindowMs?: number;
}): InboundAcceptResult {
  if (input.seenEventIds.has(input.eventId)) {
    return { ok: false, reason: "duplicate" };
  }
  const eventMs = Date.parse(input.eventTimestampUtc);
  const nowMs = Date.parse(input.nowUtc);
  if (!Number.isFinite(eventMs) || !Number.isFinite(nowMs)) {
    return { ok: false, reason: "bad_timestamp" };
  }
  const window = input.replayWindowMs ?? DEFAULT_WEBHOOK_REPLAY_WINDOW_MS;
  if (Math.abs(nowMs - eventMs) > window) {
    return { ok: false, reason: "replay_window" };
  }
  return { ok: true };
}

/** Late ship when actual ship date is after the promised delivery date. */
export function isLateShip(
  promisedDeliveryDateUtc: string,
  actualShipDateUtc: string,
): boolean {
  const promised = Date.parse(promisedDeliveryDateUtc);
  const actual = Date.parse(actualShipDateUtc);
  if (!Number.isFinite(promised) || !Number.isFinite(actual)) return false;
  return actual > promised;
}

/**
 * Timing-safe-ish hex/string compare for precomputed signatures.
 * Domain stays free of crypto; callers compute HMAC outside.
 */
export function signaturesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
