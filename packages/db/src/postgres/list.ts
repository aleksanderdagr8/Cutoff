/**
 * Thin Postgres list_lines store (Unit 14 schedule columns).
 */

import { applySkipMode, computeNextDue, isLineReadyForNudge } from "@cutoff/domain";
import type {
  ApplyListSkipInput,
  ApplyListSkipResult,
  ListLineRow,
  ListRepository,
  UpsertListLineInput,
} from "../list.js";
import type { CutoffSupabaseClient } from "../supabase-client.js";
import { ulid } from "../ulid.js";
import { mapListLine, throwOnError, type DbListLine } from "./mappers.js";

function nextDueFields(row: {
  paused: boolean;
  lastOrderedAt: string | null;
  cadenceHintDays: number | null;
}): string | null {
  return computeNextDue({
    paused: row.paused,
    lastOrderedAt: row.lastOrderedAt,
    cadenceHintDays: row.cadenceHintDays,
  }).nextDueAt;
}

export class PostgresListRepository implements ListRepository {
  constructor(private readonly db: CutoffSupabaseClient) {}

  async upsert(input: UpsertListLineInput): Promise<ListLineRow> {
    const existing = await this.findByHouseholdItem(
      input.householdId,
      input.canonicalItemId,
    );
    if (existing) {
      const cadenceHintDays =
        input.cadenceHintDays !== undefined
          ? input.cadenceHintDays
          : existing.cadenceHintDays;
      const neverSubstitute =
        input.neverSubstitute !== undefined
          ? input.neverSubstitute
          : existing.neverSubstitute;
      const leadDays =
        input.leadDays !== undefined ? input.leadDays : existing.leadDays;
      const nextDueAt = nextDueFields({
        paused: existing.paused,
        lastOrderedAt: existing.lastOrderedAt,
        cadenceHintDays,
      });
      const { data, error } = await this.db
        .from("list_lines")
        .update({
          mandate_id: input.mandateId,
          cadence_hint_days: cadenceHintDays,
          never_substitute: neverSubstitute,
          lead_days: leadDays,
          next_due_at: nextDueAt,
        })
        .eq("line_id", existing.lineId)
        .select("*")
        .single();
      throwOnError(error, "list_lines.update");
      return mapListLine(data as DbListLine);
    }

    const lineId = `ll_${ulid()}`;
    const insert = {
      line_id: lineId,
      household_id: input.householdId,
      mandate_id: input.mandateId,
      canonical_item_id: input.canonicalItemId,
      cadence_hint_days: input.cadenceHintDays ?? null,
      cadence_source: "fixed",
      learned_interval_days: null,
      never_substitute: input.neverSubstitute ?? false,
      last_quote_id: null,
      last_order_id: null,
      last_ordered_at: null,
      next_due_at: null,
      snoozed_until: null,
      lead_days: input.leadDays ?? 3,
      paused: false,
      created_at: input.nowUtc,
    };
    const { data, error } = await this.db
      .from("list_lines")
      .insert(insert)
      .select("*")
      .single();
    throwOnError(error, "list_lines.insert");
    return mapListLine(data as DbListLine);
  }

  async get(lineId: string): Promise<ListLineRow | null> {
    const { data, error } = await this.db
      .from("list_lines")
      .select("*")
      .eq("line_id", lineId)
      .maybeSingle();
    throwOnError(error, "list_lines.get");
    if (!data) return null;
    return mapListLine(data as DbListLine);
  }

  async getForHousehold(
    lineId: string,
    householdId: string,
  ): Promise<ListLineRow | null> {
    const row = await this.get(lineId);
    if (!row || row.householdId !== householdId) return null;
    return row;
  }

  async listForHousehold(householdId: string): Promise<readonly ListLineRow[]> {
    const { data, error } = await this.db
      .from("list_lines")
      .select("*")
      .eq("household_id", householdId);
    throwOnError(error, "list_lines.listForHousehold");
    return ((data ?? []) as DbListLine[]).map(mapListLine);
  }

  async listDueForNudgeCron(nowUtc: string): Promise<readonly ListLineRow[]> {
    // Broad fetch of active lines; predicate applied in-process for lead_days.
    const { data, error } = await this.db
      .from("list_lines")
      .select("*")
      .eq("paused", false)
      .not("next_due_at", "is", null);
    throwOnError(error, "list_lines.listDueForNudgeCron");
    return ((data ?? []) as DbListLine[])
      .map(mapListLine)
      .filter((l) =>
        isLineReadyForNudge({
          paused: l.paused,
          snoozedUntil: l.snoozedUntil,
          nextDueAt: l.nextDueAt,
          leadDays: l.leadDays,
          nowUtc,
        }),
      );
  }

  async skip(lineId: string): Promise<ListLineRow | null> {
    const result = await this.applySkip({
      lineId,
      mode: "pause",
      nowUtc: new Date().toISOString(),
    });
    return result.ok ? result.line : null;
  }

  async applySkip(input: ApplyListSkipInput): Promise<ApplyListSkipResult> {
    const row = await this.get(input.lineId);
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

    const { data, error } = await this.db
      .from("list_lines")
      .update({
        paused: next.paused,
        next_due_at: next.nextDueAt,
        snoozed_until: next.snoozedUntil,
      })
      .eq("line_id", input.lineId)
      .select("*")
      .single();
    throwOnError(error, "list_lines.applySkip");
    return { ok: true, line: mapListLine(data as DbListLine) };
  }

  async recordQuote(lineId: string, quoteId: string): Promise<void> {
    const { error } = await this.db
      .from("list_lines")
      .update({ last_quote_id: quoteId })
      .eq("line_id", lineId);
    throwOnError(error, "list_lines.recordQuote");
  }

  async recordOrder(
    lineId: string,
    orderId: string,
    nowUtc: string,
  ): Promise<void> {
    const row = await this.get(lineId);
    if (!row) return;
    const nextDueAt = nextDueFields({
      paused: false,
      lastOrderedAt: nowUtc,
      cadenceHintDays: row.cadenceHintDays,
    });
    const { error } = await this.db
      .from("list_lines")
      .update({
        last_order_id: orderId,
        last_ordered_at: nowUtc,
        paused: false,
        next_due_at: nextDueAt,
      })
      .eq("line_id", lineId);
    throwOnError(error, "list_lines.recordOrder");
  }

  private async findByHouseholdItem(
    householdId: string,
    canonicalItemId: string,
  ): Promise<ListLineRow | null> {
    const { data, error } = await this.db
      .from("list_lines")
      .select("*")
      .eq("household_id", householdId)
      .eq("canonical_item_id", canonicalItemId)
      .maybeSingle();
    throwOnError(error, "list_lines.findByHouseholdItem");
    if (!data) return null;
    return mapListLine(data as DbListLine);
  }
}
