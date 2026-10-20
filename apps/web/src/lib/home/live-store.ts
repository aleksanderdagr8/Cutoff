import "server-only";

import { applySkipMode } from "@cutoff/domain";
import { seedFixtureCatalog } from "@cutoff/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureHomeMember } from "./member";
import { createHomeServerClient } from "./supabase/server";
import type {
  HomeKeyView,
  HomeListLineView,
  HomeMandateView,
  HomeNudgeSettingsView,
  HomeOrderView,
  HomeSession,
} from "./types";

/** Display-only fixtures (catalog stays memory until Postgres catalog lands). */
const catalog = seedFixtureCatalog();

type MandateRpc = {
  mandate_id: string;
  ceiling_cents: number;
  expires_at: string;
  address_id: string;
  never_substitute_ids: string[];
  canonical_item_ids: string[];
  allow_cancel: boolean;
};

type KeyRpc = {
  key_id: string;
  secret?: string;
  scopes: string[];
  mandate_ids: string[];
  revoked: boolean;
  created_at: string;
  last_used_at: string | null;
};

type DbListLine = {
  line_id: string;
  canonical_item_id: string;
  cadence_hint_days: number | null;
  cadence_source: string;
  next_due_at: string | null;
  snoozed_until: string | null;
  never_substitute: boolean;
  last_quote_id: string | null;
  last_order_id: string | null;
  paused: boolean;
  mandate_id: string;
};

type DbAgent = {
  key_id: string;
  scopes: string[];
  mandate_ids: string[];
  revoked_at: string | null;
  created_at: string;
  last_used_at: string | null;
};

type DbMandate = {
  mandate_id: string;
  ceiling_cents: number;
  expires_at_utc: string;
  address_id: string;
  allow_cancel: boolean;
};

async function liveClient(
  session: HomeSession,
): Promise<
  | { ok: true; supabase: SupabaseClient; householdId: string }
  | { ok: false; error: string; status: number }
> {
  try {
    const supabase = await createHomeServerClient();
    const member = await ensureHomeMember(supabase);
    if ("error" in member) {
      return { ok: false, error: member.error, status: member.status };
    }
    if (
      member.householdId !== session.householdId ||
      member.memberId !== session.memberId
    ) {
      return { ok: false, error: "unauthenticated", status: 401 };
    }
    return { ok: true, supabase, householdId: member.householdId };
  } catch {
    return { ok: false, error: "unauthenticated", status: 401 };
  }
}

function rpcErrorStatus(message: string | undefined): {
  error: string;
  status: number;
} {
  const msg = (message ?? "").toLowerCase();
  if (msg.includes("mandate_miss")) return { error: "mandate_miss", status: 400 };
  if (msg.includes("unauthenticated")) {
    return { error: "unauthenticated", status: 401 };
  }
  return { error: "invalid_body", status: 400 };
}

function toMandateView(row: MandateRpc): HomeMandateView {
  return {
    mandate_id: row.mandate_id,
    ceiling_cents: row.ceiling_cents,
    expires_at: row.expires_at,
    address_id: row.address_id,
    never_substitute_ids: [...(row.never_substitute_ids ?? [])],
    canonical_item_ids: [...(row.canonical_item_ids ?? [])],
    allow_cancel: Boolean(row.allow_cancel),
  };
}

function toKeyView(row: DbAgent | KeyRpc): HomeKeyView {
  const revoked =
    "revoked" in row ? Boolean(row.revoked) : Boolean(row.revoked_at);
  return {
    key_id: row.key_id,
    scopes: [...row.scopes] as HomeKeyView["scopes"],
    mandate_ids: [...row.mandate_ids],
    revoked,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
  };
}

function toLineView(row: DbListLine): HomeListLineView {
  const item = catalog.get(row.canonical_item_id);
  return {
    line_id: row.line_id,
    canonical_item_id: row.canonical_item_id,
    brand: item?.brand ?? "",
    description: item?.description ?? row.canonical_item_id,
    cadence_hint_days: row.cadence_hint_days,
    cadence_source: row.cadence_source === "learned" ? "learned" : "fixed",
    next_due_at: row.next_due_at,
    snoozed_until: row.snoozed_until,
    never_substitute: row.never_substitute,
    last_quote_id: row.last_quote_id,
    last_order_id: row.last_order_id,
    last_price_cents: null,
    paused: row.paused,
    mandate_id: row.mandate_id,
    receipt_token: null,
  };
}

export async function liveListLinesForSession(
  session: HomeSession,
): Promise<HomeListLineView[]> {
  const gate = await liveClient(session);
  if (!gate.ok) return [];
  const { data, error } = await gate.supabase
    .from("list_lines")
    .select(
      "line_id, canonical_item_id, cadence_hint_days, cadence_source, next_due_at, snoozed_until, never_substitute, last_quote_id, last_order_id, paused, mandate_id",
    )
    .eq("household_id", gate.householdId);
  if (error || !data) return [];
  return (data as DbListLine[]).map(toLineView);
}

export async function liveListOrdersForSession(
  _session: HomeSession,
): Promise<HomeOrderView[]> {
  // Orders/receipts stay Worker-side until a member-readable projection lands.
  return [];
}

export async function liveSkipListLineForSession(
  session: HomeSession,
  lineId: string,
  opts: {
    mode?: "next" | "snooze" | "pause";
    until?: string | null;
  } = {},
): Promise<HomeListLineView | { error: string; status: number }> {
  const gate = await liveClient(session);
  if (!gate.ok) return { error: gate.error, status: gate.status };

  const { data: existing, error: getErr } = await gate.supabase
    .from("list_lines")
    .select("*")
    .eq("line_id", lineId)
    .eq("household_id", gate.householdId)
    .maybeSingle();
  if (getErr || !existing) return { error: "mandate_miss", status: 404 };

  const row = existing as DbListLine & {
    cadence_hint_days: number | null;
    next_due_at: string | null;
    paused: boolean;
    snoozed_until: string | null;
  };
  const mode = opts.mode ?? "pause";
  const next = applySkipMode({
    mode,
    until: opts.until,
    nowUtc: new Date().toISOString(),
    cadenceHintDays: row.cadence_hint_days,
    nextDueAt: row.next_due_at,
    paused: row.paused,
    snoozedUntil: row.snoozed_until,
  });
  if (!next.ok) {
    return { error: "invalid_body", status: 400 };
  }

  const { data: updated, error: updErr } = await gate.supabase
    .from("list_lines")
    .update({
      paused: next.paused,
      next_due_at: next.nextDueAt,
      snoozed_until: next.snoozedUntil,
    })
    .eq("line_id", lineId)
    .eq("household_id", gate.householdId)
    .select(
      "line_id, canonical_item_id, cadence_hint_days, cadence_source, next_due_at, snoozed_until, never_substitute, last_quote_id, last_order_id, paused, mandate_id",
    )
    .single();
  if (updErr || !updated) return { error: "invalid_body", status: 400 };
  return toLineView(updated as DbListLine);
}

export async function liveGetNudgeSettingsForSession(
  session: HomeSession,
): Promise<HomeNudgeSettingsView> {
  const gate = await liveClient(session);
  if (!gate.ok) {
    return {
      agent_webhook_url: null,
      email_enabled: true,
      auto_commit_enabled: false,
    };
  }
  const { data } = await gate.supabase
    .from("household_nudge_settings")
    .select("agent_webhook_url, email_enabled")
    .eq("household_id", gate.householdId)
    .maybeSingle();
  return {
    agent_webhook_url: data?.agent_webhook_url ?? null,
    email_enabled: data?.email_enabled ?? true,
    auto_commit_enabled: false,
  };
}

export async function liveUpsertNudgeSettingsForSession(
  session: HomeSession,
  input: {
    agent_webhook_url?: string | null;
    email_enabled?: boolean;
  },
): Promise<HomeNudgeSettingsView | { error: string; status: number }> {
  const gate = await liveClient(session);
  if (!gate.ok) return { error: gate.error, status: gate.status };
  // No authenticated insert policy yet — settings stay Worker-owned.
  void input;
  return liveGetNudgeSettingsForSession(session);
}

export async function liveGetMandateForSession(
  session: HomeSession,
): Promise<HomeMandateView | null> {
  const gate = await liveClient(session);
  if (!gate.ok) return null;

  const { data: mandate } = await gate.supabase
    .from("mandates")
    .select("mandate_id, ceiling_cents, expires_at_utc, address_id, allow_cancel")
    .eq("household_id", gate.householdId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!mandate) return null;

  const row = mandate as DbMandate;
  const { data: lines } = await gate.supabase
    .from("mandate_lines")
    .select("kind, value")
    .eq("mandate_id", row.mandate_id);

  const canonical: string[] = [];
  const never: string[] = [];
  for (const line of lines ?? []) {
    if (line.kind === "canonical_item") canonical.push(line.value);
    if (line.kind === "never_substitute") never.push(line.value);
  }

  return {
    mandate_id: row.mandate_id,
    ceiling_cents: row.ceiling_cents,
    expires_at: row.expires_at_utc,
    address_id: row.address_id,
    never_substitute_ids: never,
    canonical_item_ids: canonical,
    allow_cancel: row.allow_cancel,
  };
}

export async function liveUpsertMandateForSession(
  session: HomeSession,
  input: {
    ceiling_cents: number;
    expires_at: string;
    address_id: string;
    never_substitute_ids: string[];
    canonical_item_ids?: string[];
  },
): Promise<HomeMandateView | { error: string; status: number }> {
  const gate = await liveClient(session);
  if (!gate.ok) return { error: gate.error, status: gate.status };

  const { data, error } = await gate.supabase.rpc("home_upsert_mandate", {
    p_ceiling_cents: input.ceiling_cents,
    p_expires_at: input.expires_at,
    p_address_id: input.address_id,
    p_never_substitute_ids: input.never_substitute_ids,
    p_canonical_item_ids: input.canonical_item_ids ?? null,
  });
  if (error || !data) return rpcErrorStatus(error?.message);
  return toMandateView(data as MandateRpc);
}

export async function liveListKeysForSession(
  session: HomeSession,
): Promise<HomeKeyView[]> {
  const gate = await liveClient(session);
  if (!gate.ok) return [];
  const { data, error } = await gate.supabase
    .from("agent_credentials")
    .select("key_id, scopes, mandate_ids, revoked_at, created_at, last_used_at")
    .eq("household_id", gate.householdId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as DbAgent[]).map(toKeyView);
}

export async function liveIssueKeyForSession(
  session: HomeSession,
  scopes: Array<"quote" | "commit" | "read_list">,
): Promise<
  | (HomeKeyView & { secret: string })
  | { error: string; status: number }
> {
  const gate = await liveClient(session);
  if (!gate.ok) return { error: gate.error, status: gate.status };

  const { data, error } = await gate.supabase.rpc("home_issue_agent_key", {
    p_scopes: scopes,
  });
  if (error || !data) return rpcErrorStatus(error?.message);
  const row = data as KeyRpc;
  if (!row.secret) return { error: "invalid_body", status: 400 };
  return {
    ...toKeyView(row),
    secret: row.secret,
  };
}

export async function liveRevokeKeyForSession(
  session: HomeSession,
  keyId: string,
): Promise<{ key_id: string; revoked: true } | { error: string; status: number }> {
  const gate = await liveClient(session);
  if (!gate.ok) return { error: gate.error, status: gate.status };

  const { data, error } = await gate.supabase.rpc("home_revoke_agent_key", {
    p_key_id: keyId,
  });
  if (error || !data) return rpcErrorStatus(error?.message);
  return { key_id: keyId, revoked: true };
}
