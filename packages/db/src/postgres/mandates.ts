import { applyLowerCeiling, type MandateSnapshot } from "@cutoff/domain";
import type {
  CreateMandateInput,
  MandateRepository,
  MandateRow,
} from "../mandates.js";
import type { CutoffSupabaseClient } from "../supabase-client.js";
import { ulid } from "../ulid.js";
import {
  mapMandate,
  throwOnError,
  type DbMandate,
  type DbMandateLine,
} from "./mappers.js";

export class PostgresMandateRepository implements MandateRepository {
  constructor(private readonly db: CutoffSupabaseClient) {}

  async create(input: CreateMandateInput): Promise<MandateRow> {
    const mandateId = ulid();
    const now = new Date().toISOString();
    const { error } = await this.db.from("mandates").insert({
      mandate_id: mandateId,
      household_id: input.householdId,
      ceiling_cents: input.ceilingCents,
      expires_at_utc: input.expiresAtUtc,
      address_id: input.addressId,
      actor_cap: input.actorCap ?? 4,
      allow_cancel: input.allowCancel ?? false,
      created_at: now,
      updated_at: now,
    });
    throwOnError(error, "mandates.insert");

    const lines: Array<{
      line_id: string;
      mandate_id: string;
      kind: DbMandateLine["kind"];
      value: string;
    }> = [];
    for (const value of input.canonicalItemIds) {
      lines.push({
        line_id: ulid(),
        mandate_id: mandateId,
        kind: "canonical_item",
        value,
      });
    }
    for (const value of input.categoryAllowList ?? []) {
      lines.push({
        line_id: ulid(),
        mandate_id: mandateId,
        kind: "category_allow",
        value,
      });
    }
    for (const value of input.neverSubstituteIds ?? []) {
      lines.push({
        line_id: ulid(),
        mandate_id: mandateId,
        kind: "never_substitute",
        value,
      });
    }
    if (lines.length > 0) {
      const { error: lineError } = await this.db
        .from("mandate_lines")
        .insert(lines);
      throwOnError(lineError, "mandate_lines.insert");
    }

    const row = await this.get(mandateId);
    if (!row) throw new Error("mandates.insert: row missing after insert");
    return row;
  }

  async get(mandateId: string): Promise<MandateRow | null> {
    const { data, error } = await this.db
      .from("mandates")
      .select("*")
      .eq("mandate_id", mandateId)
      .maybeSingle();
    throwOnError(error, "mandates.get");
    if (!data) return null;
    const lines = await this.loadLines(mandateId);
    return mapMandate(data as DbMandate, lines);
  }

  async getForHousehold(
    mandateId: string,
    householdId: string,
  ): Promise<MandateRow | null> {
    const row = await this.get(mandateId);
    if (!row || row.householdId !== householdId) return null;
    return row;
  }

  async listForHousehold(householdId: string): Promise<readonly MandateRow[]> {
    const { data, error } = await this.db
      .from("mandates")
      .select("*")
      .eq("household_id", householdId);
    throwOnError(error, "mandates.listForHousehold");
    const rows = (data ?? []) as DbMandate[];
    const out: MandateRow[] = [];
    for (const row of rows) {
      out.push(mapMandate(row, await this.loadLines(row.mandate_id)));
    }
    return out;
  }

  async listAll(): Promise<readonly MandateRow[]> {
    const { data, error } = await this.db.from("mandates").select("*");
    throwOnError(error, "mandates.listAll");
    const rows = (data ?? []) as DbMandate[];
    const out: MandateRow[] = [];
    for (const row of rows) {
      out.push(mapMandate(row, await this.loadLines(row.mandate_id)));
    }
    return out;
  }

  toSnapshot(row: MandateRow): MandateSnapshot {
    return {
      ceilingCents: row.ceilingCents,
      expiresAtUtc: row.expiresAtUtc,
      canonicalItemIds: row.canonicalItemIds,
      categoryAllowList: row.categoryAllowList,
      neverSubstituteIds: row.neverSubstituteIds,
      addressId: row.addressId,
      actorCap: row.actorCap,
    };
  }

  async lowerCeiling(
    mandateId: string,
    householdId: string,
    requestedCeilingCents: number,
  ): Promise<MandateRow | null> {
    const row = await this.getForHousehold(mandateId, householdId);
    if (!row) return null;
    const next = applyLowerCeiling(row.ceilingCents, requestedCeilingCents);
    if (next === null) return null;
    const updatedAt = new Date().toISOString();
    const { error } = await this.db
      .from("mandates")
      .update({ ceiling_cents: next, updated_at: updatedAt })
      .eq("mandate_id", mandateId)
      .eq("household_id", householdId);
    throwOnError(error, "mandates.lowerCeiling");
    return this.get(mandateId);
  }

  private async loadLines(mandateId: string): Promise<DbMandateLine[]> {
    const { data, error } = await this.db
      .from("mandate_lines")
      .select("kind, value")
      .eq("mandate_id", mandateId);
    throwOnError(error, "mandate_lines.list");
    return (data ?? []) as DbMandateLine[];
  }
}
