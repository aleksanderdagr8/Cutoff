/**
 * Pure household-list / reorder rules. No I/O.
 * Unit 11: automation is a new commit against a list, not a sticky subscription.
 */

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
