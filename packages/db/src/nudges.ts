/**
 * Reorder nudge settings + nudge rows (Unit 14).
 * Cron/queue delivery is Unit 20–21; these repos are durable write surfaces.
 */

import type { MaybePromise } from "./types.js";
import { ulid } from "./ulid.js";

export type NudgeChannel = "agent_webhook" | "email";

export type NudgeStatus =
  | "pending"
  | "sent"
  | "failed"
  | "acted"
  | "skipped"
  | "expired";

export type HouseholdNudgeSettingsRow = {
  householdId: string;
  agentWebhookUrl: string | null;
  /** Vault / CF secret store ref — never the raw HMAC secret. */
  agentWebhookSecretRef: string | null;
  emailEnabled: boolean;
  /** Reserved false; v1 never auto-commits (Locked §8.1). */
  autoCommitEnabled: false;
  updatedAt: string;
};

export type UpsertNudgeSettingsInput = {
  householdId: string;
  agentWebhookUrl?: string | null;
  agentWebhookSecretRef?: string | null;
  emailEnabled?: boolean;
  nowUtc: string;
};

export type ReorderNudgeRow = {
  nudgeId: string;
  householdId: string;
  lineId: string;
  dueAt: string;
  channel: NudgeChannel;
  status: NudgeStatus;
  attempts: number;
  resolvedOrderId: string | null;
  createdAt: string;
};

export type InsertReorderNudgeInput = {
  householdId: string;
  lineId: string;
  dueAt: string;
  channel: NudgeChannel;
  nowUtc: string;
  nudgeId?: string;
};

export interface HouseholdNudgeSettingsRepository {
  get(householdId: string): MaybePromise<HouseholdNudgeSettingsRow | null>;
  upsert(
    input: UpsertNudgeSettingsInput,
  ): MaybePromise<HouseholdNudgeSettingsRow>;
}

export interface ReorderNudgeRepository {
  insert(
    input: InsertReorderNudgeInput,
  ): MaybePromise<
    | { ok: true; nudge: ReorderNudgeRow; created: boolean }
    | { ok: false; error: "duplicate" }
  >;
  get(nudgeId: string): MaybePromise<ReorderNudgeRow | null>;
  listForHousehold(
    householdId: string,
  ): MaybePromise<readonly ReorderNudgeRow[]>;
  markStatus(
    nudgeId: string,
    status: NudgeStatus,
    opts?: { resolvedOrderId?: string; bumpAttempts?: boolean },
  ): MaybePromise<ReorderNudgeRow | null>;
}

function assertHttpsUrl(url: string | null | undefined): void {
  if (url == null || url === "") return;
  if (!url.startsWith("https://")) {
    throw new Error("agent_webhook_url_must_be_https");
  }
}

export class MemoryHouseholdNudgeSettingsRepository
  implements HouseholdNudgeSettingsRepository
{
  private readonly rows = new Map<string, HouseholdNudgeSettingsRow>();

  get(householdId: string): HouseholdNudgeSettingsRow | null {
    return this.rows.get(householdId) ?? null;
  }

  upsert(input: UpsertNudgeSettingsInput): HouseholdNudgeSettingsRow {
    assertHttpsUrl(input.agentWebhookUrl);
    const existing = this.rows.get(input.householdId);
    const row: HouseholdNudgeSettingsRow = {
      householdId: input.householdId,
      agentWebhookUrl:
        input.agentWebhookUrl !== undefined
          ? input.agentWebhookUrl
          : (existing?.agentWebhookUrl ?? null),
      agentWebhookSecretRef:
        input.agentWebhookSecretRef !== undefined
          ? input.agentWebhookSecretRef
          : (existing?.agentWebhookSecretRef ?? null),
      emailEnabled:
        input.emailEnabled !== undefined
          ? input.emailEnabled
          : (existing?.emailEnabled ?? true),
      autoCommitEnabled: false,
      updatedAt: input.nowUtc,
    };
    this.rows.set(input.householdId, row);
    return row;
  }
}

export class MemoryReorderNudgeRepository implements ReorderNudgeRepository {
  private readonly rows: ReorderNudgeRow[] = [];

  insert(
    input: InsertReorderNudgeInput,
  ):
    | { ok: true; nudge: ReorderNudgeRow; created: boolean }
    | { ok: false; error: "duplicate" } {
    const dup = this.rows.find(
      (r) =>
        r.lineId === input.lineId &&
        r.dueAt === input.dueAt &&
        r.channel === input.channel,
    );
    if (dup) {
      return { ok: true, nudge: dup, created: false };
    }

    const nudge: ReorderNudgeRow = {
      nudgeId: input.nudgeId ?? `nudge_${ulid()}`,
      householdId: input.householdId,
      lineId: input.lineId,
      dueAt: input.dueAt,
      channel: input.channel,
      status: "pending",
      attempts: 0,
      resolvedOrderId: null,
      createdAt: input.nowUtc,
    };
    this.rows.push(nudge);
    return { ok: true, nudge, created: true };
  }

  get(nudgeId: string): ReorderNudgeRow | null {
    return this.rows.find((r) => r.nudgeId === nudgeId) ?? null;
  }

  listForHousehold(householdId: string): readonly ReorderNudgeRow[] {
    return this.rows.filter((r) => r.householdId === householdId);
  }

  markStatus(
    nudgeId: string,
    status: NudgeStatus,
    opts?: { resolvedOrderId?: string; bumpAttempts?: boolean },
  ): ReorderNudgeRow | null {
    const row = this.get(nudgeId);
    if (!row) return null;
    row.status = status;
    if (opts?.resolvedOrderId !== undefined) {
      row.resolvedOrderId = opts.resolvedOrderId;
    }
    if (opts?.bumpAttempts) {
      row.attempts += 1;
    }
    return row;
  }
}
