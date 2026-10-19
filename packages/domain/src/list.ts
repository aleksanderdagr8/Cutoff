/**
 * Pure household-list / reorder rules. No I/O.
 * Unit 11: automation is a new commit against a list, not a sticky subscription.
 * Unit 13: fixed-cadence next-due (learned cadence is P4).
 */

const MS_PER_DAY = 86_400_000;

/** Keys the agent API must never accept on reorder (brief + Unit 11). */
export const REORDER_BANNED_FIELD_NAMES = [
  "image",
  "weight",
  "sensor",
  "camera",
  "photo",
] as const;

export type ReorderBannedField =
  (typeof REORDER_BANNED_FIELD_NAMES)[number];

/**
 * True when a body object carries a depletion / sensor-shaped field.
 * Schema strictness rejects unknowns; this names the Unit 11 ban explicitly.
 */
export function hasBannedReorderField(
  body: Record<string, unknown> | null | undefined,
): body is Record<string, unknown> & {
  [K in ReorderBannedField]?: unknown;
} {
  if (!body || typeof body !== "object") return false;
  return REORDER_BANNED_FIELD_NAMES.some((k) =>
    Object.prototype.hasOwnProperty.call(body, k),
  );
}

export type ListLinePauseState = {
  paused: boolean;
};

/** Skip on a list line pauses it and must not place an order. */
export function applyListLineSkip(
  line: ListLinePauseState,
): ListLinePauseState {
  return { paused: true };
}

export type SkipMode = "next" | "snooze" | "pause";

export type ApplySkipModeInput = {
  mode: SkipMode;
  until?: string | null;
  nowUtc: string;
  cadenceHintDays: number | null;
  nextDueAt: string | null;
  paused: boolean;
  snoozedUntil: string | null;
};

export type ApplySkipModeResult =
  | {
      ok: true;
      paused: boolean;
      nextDueAt: string | null;
      snoozedUntil: string | null;
    }
  | { ok: false; error: "invalid_until" | "no_cadence" };

/**
 * Unit 15 skip modes (pure):
 * - pause: indefinite pause (Unit 11)
 * - next: advance next_due_at by one cadence interval
 * - snooze: set snoozed_until (requires until > now)
 */
export function applySkipMode(input: ApplySkipModeInput): ApplySkipModeResult {
  if (input.mode === "pause") {
    return {
      ok: true,
      paused: true,
      nextDueAt: null,
      snoozedUntil: null,
    };
  }

  if (input.mode === "snooze") {
    if (
      input.until == null ||
      Number.isNaN(Date.parse(input.until)) ||
      Date.parse(input.until) <= Date.parse(input.nowUtc)
    ) {
      return { ok: false, error: "invalid_until" };
    }
    return {
      ok: true,
      paused: false,
      nextDueAt: input.nextDueAt,
      snoozedUntil: input.until,
    };
  }

  // mode === "next"
  if (input.cadenceHintDays == null || input.cadenceHintDays < 1) {
    return { ok: false, error: "no_cadence" };
  }
  const baseIso =
    input.nextDueAt != null && !Number.isNaN(Date.parse(input.nextDueAt))
      ? input.nextDueAt
      : input.nowUtc;
  const advanced = addUtcDays(baseIso, input.cadenceHintDays);
  if (advanced == null) {
    return { ok: false, error: "no_cadence" };
  }
  return {
    ok: true,
    paused: false,
    nextDueAt: advanced,
    snoozedUntil: null,
  };
}

/**
 * Reorder never reuses a sticky fulfiller id from the last quote.
 * Callers must pass null / omit previous winner into the quote path.
 */
export function stickyFulfillerForReorder(
  _lastFulfillerId: string | null | undefined,
): null {
  void _lastFulfillerId;
  return null;
}

export type ComputeNextDueInput = {
  paused: boolean;
  /** UTC ISO timestamp of last successful order, if any. */
  lastOrderedAt: string | null;
  /** Fixed cadence in days (P1). Null → never due. */
  cadenceHintDays: number | null;
};

export type ComputeNextDueResult = {
  nextDueAt: string | null;
  /** Explainable due copy for agents / UI; null when never due. */
  reason: string | null;
};

function utcDateLabel(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toISOString().slice(0, 10);
}

function addUtcDays(iso: string, days: number): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/**
 * Fixed cadence only (Unit 13 / P1): `last_ordered_at + cadence_hint_days`.
 * Paused lines and lines without cadence or order history are never due.
 * Learned cadence is deferred to P4.
 */
export function computeNextDue(
  input: ComputeNextDueInput,
): ComputeNextDueResult {
  if (input.paused) {
    return { nextDueAt: null, reason: null };
  }
  if (
    input.cadenceHintDays == null ||
    input.cadenceHintDays < 1 ||
    input.lastOrderedAt == null
  ) {
    return { nextDueAt: null, reason: null };
  }

  const nextDueAt = addUtcDays(input.lastOrderedAt, input.cadenceHintDays);
  if (nextDueAt == null) {
    return { nextDueAt: null, reason: null };
  }

  return {
    nextDueAt,
    reason: `every ${input.cadenceHintDays} days, last ordered ${utcDateLabel(input.lastOrderedAt)}`,
  };
}

/**
 * True when `nextDueAt` is on or before `nowUtc + withinDays`.
 * Overdue lines (past due) are included. Null next due is never due.
 */
export function isDueWithin(
  nextDueAt: string | null,
  nowUtc: string,
  withinDays: number,
): boolean {
  if (nextDueAt == null || withinDays < 0) return false;
  const dueMs = Date.parse(nextDueAt);
  const nowMs = Date.parse(nowUtc);
  if (Number.isNaN(dueMs) || Number.isNaN(nowMs)) return false;
  return dueMs <= nowMs + withinDays * MS_PER_DAY;
}
