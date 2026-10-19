/**
 * Household list module. Owns list_lines.
 * Unit 11: cadence hint, never-substitute, last quote/order; skip pauses.
 * Unit 13–14: lastOrderedAt / nextDueAt / schedule columns (fixed cadence).
 */

import {
  applySkipMode,
  computeNextDue,
  isLineReadyForNudge,
  type SkipMode,
} from "@cutoff/domain";
import type { MaybePromise } from "./types.js";
import { ulid } from "./ulid.js";

export type CadenceSource = "fixed" | "learned";

export type ListLineRow = {
  lineId: string;
  householdId: string;
  mandateId: string;
  canonicalItemId: string;
  /** Cadence hint in days — advisory only; depletion is not an input. */
  cadenceHintDays: number | null;
  /** P1 always `fixed`; `learned` reserved for P4. */
  cadenceSource: CadenceSource;
  /** Reserved P4; unused by computeNextDue until then. */
  learnedIntervalDays: number | null;
  neverSubstitute: boolean;
  lastQuoteId: string | null;
  lastOrderId: string | null;
  /** UTC ISO of last successful order; drives computeNextDue. */
  lastOrderedAt: string | null;
  /** Persisted next due (Unit 14); recomputed on order. */
  nextDueAt: string | null;
  snoozedUntil: string | null;
  /** Days before next_due_at when cron may nudge (Unit 20). */
  leadDays: number;
  paused: boolean;
  createdAt: string;
};

export type UpsertListLineInput = {
  householdId: string;
  mandateId: string;
  canonicalItemId: string;
  cadenceHintDays?: number | null;
  neverSubstitute?: boolean;
  leadDays?: number;
  nowUtc: string;
};

export type ApplyListSkipInput = {
  lineId: string;
  mode: SkipMode;
  until?: string | null;
  nowUtc: string;
};

export type ApplyListSkipResult =
  | { ok: true; line: ListLineRow }
  | { ok: false; error: "not_found" | "invalid_until" | "no_cadence" };

/** Shared surface for memory + Postgres list repos. */
export interface ListRepository {
  upsert(input: UpsertListLineInput): MaybePromise<ListLineRow>;
  get(lineId: string): MaybePromise<ListLineRow | null>;
  getForHousehold(
    lineId: string,
    householdId: string,
  ): MaybePromise<ListLineRow | null>;
  listForHousehold(householdId: string): MaybePromise<readonly ListLineRow[]>;
  /**
   * Unit 20 cron: lines ready for nudge
   * (paused=false, not snoozed, next_due_at - lead_days <= now).
   */
  listDueForNudgeCron(nowUtc: string): MaybePromise<readonly ListLineRow[]>;
  /** Unit 11 compat: pause the line. */
  skip(lineId: string): MaybePromise<ListLineRow | null>;
  /** Unit 15: next | snooze | pause. */
  applySkip(input: ApplyListSkipInput): MaybePromise<ApplyListSkipResult>;
  recordQuote(lineId: string, quoteId: string): MaybePromise<void>;
  recordOrder(
    lineId: string,
    orderId: string,
    nowUtc: string,
  ): MaybePromise<void>;
}

function refreshNextDue(row: ListLineRow): void {
  // Learned cadence deferred (P4) — always use fixed path.
  const due = computeNextDue({
    paused: row.paused,
    lastOrderedAt: row.lastOrderedAt,
    cadenceHintDays: row.cadenceHintDays,
  });
  row.nextDueAt = due.nextDueAt;
}

export class MemoryListRepository implements ListRepository {
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
      if (input.leadDays !== undefined) {
        existing.leadDays = input.leadDays;
      }
      refreshNextDue(existing);
      return existing;
    }

    const row: ListLineRow = {
      lineId: `ll_${ulid()}`,
      householdId: input.householdId,
      mandateId: input.mandateId,
      canonicalItemId: input.canonicalItemId,
      cadenceHintDays: input.cadenceHintDays ?? null,
      cadenceSource: "fixed",
      learnedIntervalDays: null,
      neverSubstitute: input.neverSubstitute ?? false,
      lastQuoteId: null,
      lastOrderId: null,
      lastOrderedAt: null,
      nextDueAt: null,
      snoozedUntil: null,
      leadDays: input.leadDays ?? 3,
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

  listDueForNudgeCron(nowUtc: string): readonly ListLineRow[] {
    return this.lines.filter((l) =>
      isLineReadyForNudge({
        paused: l.paused,
        snoozedUntil: l.snoozedUntil,
        nextDueAt: l.nextDueAt,
        leadDays: l.leadDays,
        nowUtc,
      }),
    );
  }

  skip(lineId: string): ListLineRow | null {
    const result = this.applySkip({
      lineId,
      mode: "pause",
      nowUtc: new Date().toISOString(),
    });
    return result.ok ? result.line : null;
  }

  applySkip(input: ApplyListSkipInput): ApplyListSkipResult {
    const row = this.get(input.lineId);
    if (!row) return { ok: false, error: "not_found" };
    const next = applySkipMode({
      mode: input.mode,
      until: input.until,
      nowUtc: input.nowUtc,
      cadenceHintDays: row.cadenceHintDays,
      nextDueAt: row.nextDueAt,
      paused: row.paused,
      snoozedUntil: row.snoozedUntil,
    });
    if (!next.ok) return { ok: false, error: next.error };
    row.paused = next.paused;
    row.nextDueAt = next.nextDueAt;
    row.snoozedUntil = next.snoozedUntil;
    return { ok: true, line: row };
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
      refreshNextDue(row);
    }
  }
}
