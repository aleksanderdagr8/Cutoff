/**
 * Thin Postgres repos for household_nudge_settings + reorder_nudges (Unit 14).
 */

import type {
  HouseholdNudgeSettingsRepository,
  HouseholdNudgeSettingsRow,
  InsertReorderNudgeInput,
  NudgeStatus,
  ReorderNudgeRepository,
  ReorderNudgeRow,
  UpsertNudgeSettingsInput,
} from "../nudges.js";
import type { CutoffSupabaseClient } from "../supabase-client.js";
import { ulid } from "../ulid.js";
import {
  mapHouseholdNudgeSettings,
  mapReorderNudge,
  throwOnError,
  type DbHouseholdNudgeSettings,
  type DbReorderNudge,
} from "./mappers.js";

export class PostgresHouseholdNudgeSettingsRepository
  implements HouseholdNudgeSettingsRepository
{
  constructor(private readonly db: CutoffSupabaseClient) {}

  async get(householdId: string): Promise<HouseholdNudgeSettingsRow | null> {
    const { data, error } = await this.db
      .from("household_nudge_settings")
      .select("*")
      .eq("household_id", householdId)
      .maybeSingle();
    throwOnError(error, "household_nudge_settings.get");
    if (!data) return null;
    return mapHouseholdNudgeSettings(data as DbHouseholdNudgeSettings);
  }

  async upsert(
    input: UpsertNudgeSettingsInput,
  ): Promise<HouseholdNudgeSettingsRow> {
    if (
      input.agentWebhookUrl != null &&
      input.agentWebhookUrl !== "" &&
      !input.agentWebhookUrl.startsWith("https://")
    ) {
      throw new Error("agent_webhook_url_must_be_https");
    }

    const existing = await this.get(input.householdId);
    const row = {
      household_id: input.householdId,
      agent_webhook_url:
        input.agentWebhookUrl !== undefined
          ? input.agentWebhookUrl
          : (existing?.agentWebhookUrl ?? null),
      agent_webhook_secret_ref:
        input.agentWebhookSecretRef !== undefined
          ? input.agentWebhookSecretRef
          : (existing?.agentWebhookSecretRef ?? null),
      email_enabled:
        input.emailEnabled !== undefined
          ? input.emailEnabled
          : (existing?.emailEnabled ?? true),
      auto_commit_enabled: false,
      updated_at: input.nowUtc,
    };

    const { data, error } = await this.db
      .from("household_nudge_settings")
      .upsert(row, { onConflict: "household_id" })
      .select("*")
      .single();
    throwOnError(error, "household_nudge_settings.upsert");
    return mapHouseholdNudgeSettings(data as DbHouseholdNudgeSettings);
  }
}

export class PostgresReorderNudgeRepository implements ReorderNudgeRepository {
  constructor(private readonly db: CutoffSupabaseClient) {}

  async insert(
    input: InsertReorderNudgeInput,
  ): Promise<
    | { ok: true; nudge: ReorderNudgeRow; created: boolean }
    | { ok: false; error: "duplicate" }
  > {
    const nudgeId = input.nudgeId ?? `nudge_${ulid()}`;
    const insert = {
      nudge_id: nudgeId,
      household_id: input.householdId,
      line_id: input.lineId,
      due_at: input.dueAt,
      channel: input.channel,
      status: "pending",
      attempts: 0,
      resolved_order_id: null,
      created_at: input.nowUtc,
    };

    const { data, error } = await this.db
      .from("reorder_nudges")
      .insert(insert)
      .select("*")
      .maybeSingle();

    if (error) {
      // unique (line_id, due_at, channel) → idempotent re-read
      if (error.message.toLowerCase().includes("duplicate")) {
        const existing = await this.findByCycle(
          input.lineId,
          input.dueAt,
          input.channel,
        );
        if (existing) {
          return { ok: true, nudge: existing, created: false };
        }
        return { ok: false, error: "duplicate" };
      }
      throwOnError(error, "reorder_nudges.insert");
    }

    if (!data) {
      const existing = await this.findByCycle(
        input.lineId,
        input.dueAt,
        input.channel,
      );
      if (existing) {
        return { ok: true, nudge: existing, created: false };
      }
      throw new Error("reorder_nudges.insert: row missing after insert");
    }

    return {
      ok: true,
      nudge: mapReorderNudge(data as DbReorderNudge),
      created: true,
    };
  }

  async get(nudgeId: string): Promise<ReorderNudgeRow | null> {
    const { data, error } = await this.db
      .from("reorder_nudges")
      .select("*")
      .eq("nudge_id", nudgeId)
      .maybeSingle();
    throwOnError(error, "reorder_nudges.get");
    if (!data) return null;
    return mapReorderNudge(data as DbReorderNudge);
  }

  async listForHousehold(
    householdId: string,
  ): Promise<readonly ReorderNudgeRow[]> {
    const { data, error } = await this.db
      .from("reorder_nudges")
      .select("*")
      .eq("household_id", householdId);
    throwOnError(error, "reorder_nudges.listForHousehold");
    return ((data ?? []) as DbReorderNudge[]).map(mapReorderNudge);
  }

  async markStatus(
    nudgeId: string,
    status: NudgeStatus,
    opts?: { resolvedOrderId?: string; bumpAttempts?: boolean },
  ): Promise<ReorderNudgeRow | null> {
    const existing = await this.get(nudgeId);
    if (!existing) return null;
    const patch: Record<string, unknown> = { status };
    if (opts?.resolvedOrderId !== undefined) {
      patch.resolved_order_id = opts.resolvedOrderId;
    }
    if (opts?.bumpAttempts) {
      patch.attempts = existing.attempts + 1;
    }
    const { data, error } = await this.db
      .from("reorder_nudges")
      .update(patch)
      .eq("nudge_id", nudgeId)
      .select("*")
      .single();
    throwOnError(error, "reorder_nudges.markStatus");
    return mapReorderNudge(data as DbReorderNudge);
  }

  async markPendingSkippedForLine(
    lineId: string,
  ): Promise<readonly ReorderNudgeRow[]> {
    const { data, error } = await this.db
      .from("reorder_nudges")
      .update({ status: "skipped" })
      .eq("line_id", lineId)
      .eq("status", "pending")
      .select("*");
    throwOnError(error, "reorder_nudges.markPendingSkippedForLine");
    return ((data ?? []) as DbReorderNudge[]).map(mapReorderNudge);
  }

  private async findByCycle(
    lineId: string,
    dueAt: string,
    channel: string,
  ): Promise<ReorderNudgeRow | null> {
    const { data, error } = await this.db
      .from("reorder_nudges")
      .select("*")
      .eq("line_id", lineId)
      .eq("due_at", dueAt)
      .eq("channel", channel)
      .maybeSingle();
    throwOnError(error, "reorder_nudges.findByCycle");
    if (!data) return null;
    return mapReorderNudge(data as DbReorderNudge);
  }
}
