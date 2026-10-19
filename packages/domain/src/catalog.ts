/**
 * Pure catalog rules. No I/O.
 * Unit 4: comparable packs, plain-text descriptions, recall exclusion.
 */

const MAX_DESCRIPTION_LENGTH = 500;

const URL_PATTERN = /https?:\/\/|www\./i;

export type DescriptionValidation =
  | { ok: true; description: string }
  | { ok: false; reason: "markup" | "url" | "too_long" | "empty" };

/**
 * Descriptions are plain text, length-capped, no markup.
 * Reject `<` and URLs at ingest.
 */
export function validateDescription(
  raw: string,
  maxLength: number = MAX_DESCRIPTION_LENGTH,
): DescriptionValidation {
  const description = raw.trim();
  if (description.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (description.length > maxLength) {
    return { ok: false, reason: "too_long" };
  }
  if (description.includes("<")) {
    return { ok: false, reason: "markup" };
  }
  if (URL_PATTERN.test(description)) {
    return { ok: false, reason: "url" };
  }
  return { ok: true, description };
}

/** Unit price basis: landed cents divided by pack count (integer cents). */
export function unitPriceCents(landedCents: number, packCount: number): number {
  if (
    !Number.isInteger(landedCents) ||
    landedCents < 0 ||
    !Number.isInteger(packCount) ||
    packCount < 1
  ) {
    throw new Error("invalid_unit_price_inputs");
  }
  return Math.floor(landedCents / packCount);
}

export function isExcludedByRecall(recalled: boolean): boolean {
  return recalled === true;
}
