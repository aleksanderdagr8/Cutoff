/**
 * Household list module. Owns list_lines only.
 * Unit 11: cadence hint, never-substitute, last quote/order; skip pauses.
 * Unit 13: lastOrderedAt in-memory for fixed-cadence due (SQL column in Unit 14).
 */

import { applyListLineSkip } from "@cutoff/domain";
import { ulid } from "./ulid.js";

export type ListLineRow = {
  lineId: string;
  householdId: string;
  mandateId: string;
  canonicalItemId: string;
  /** Cadence hint in days — advisory only; depletion is not an input. */
  cadenceHintDays: number | null;
  neverSubstitute: boolean;
  lastQuoteId: string | null;
  lastOrderId: string | null;
  /** UTC ISO of last successful order; drives computeNextDue (Unit 13). */
  lastOrderedAt: string | null;
  paused: boolean;
  createdAt: string;
};

export type UpsertListLineInput = {
  householdId: string;
  mandateId: string;
  canonicalItemId: string;
  cadenceHintDays?: number | null;
  neverSubstitute?: boolean;
  nowUtc: string;
};

export class MemoryListRepository {
  private readonly lines: ListLineRow[] = [];

  upsert(input: UpsertListLineInput): ListLineRow {
    const existing = this.lines.find(
      (l) =>
        l.householdId === input.householdId &&
        l.canonicalItemId === input.canonicalItemId,
    );
    if (existing) {
      existing.mandateId = input.mandateId;
      if (input.cadenceHintDays !== undefined) {
        existing.cadenceHintDays = input.cadenceHintDays;
      }
      if (input.neverSubstitute !== undefined) {
        existing.neverSubstitute = input.neverSubstitute;
      }
      return existing;
    }

    const row: ListLineRow = {
      lineId: `ll_${ulid()}`,
      householdId: input.householdId,
      mandateId: input.mandateId,
      canonicalItemId: input.canonicalItemId,
      cadenceHintDays: input.cadenceHintDays ?? null,
      neverSubstitute: input.neverSubstitute ?? false,
      lastQuoteId: null,
      lastOrderId: null,
      lastOrderedAt: null,
      paused: false,
      createdAt: input.nowUtc,
    };
    this.lines.push(row);
    return row;
  }

  get(lineId: string): ListLineRow | null {
    return this.lines.find((l) => l.lineId === lineId) ?? null;
  }

  getForHousehold(lineId: string, householdId: string): ListLineRow | null {
    const row = this.get(lineId);
    if (!row || row.householdId !== householdId) return null;
    return row;
  }

  listForHousehold(householdId: string): readonly ListLineRow[] {
    return this.lines.filter((l) => l.householdId === householdId);
  }

  skip(lineId: string): ListLineRow | null {
    const row = this.get(lineId);
    if (!row) return null;
    const next = applyListLineSkip(row);
    row.paused = next.paused;
    return row;
  }

  recordQuote(lineId: string, quoteId: string): void {
    const row = this.get(lineId);
    if (row) row.lastQuoteId = quoteId;
  }

  recordOrder(lineId: string, orderId: string, nowUtc: string): void {
    const row = this.get(lineId);
    if (row) {
      row.lastOrderId = orderId;
      row.lastOrderedAt = nowUtc;
      row.paused = false;
    }
  }
}
