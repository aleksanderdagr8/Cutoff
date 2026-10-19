import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { HomeSession } from "./session";

type EnsureMemberRow = {
  member_id: string;
  household_id: string;
  email: string;
  household_name: string;
};

/**
 * Link auth.users.id → members.auth_user_id (create household/member if needed).
 * Uses SECURITY DEFINER RPC so apps/web never holds a privileged DB key.
 */
export async function ensureHomeMember(
  supabase: SupabaseClient,
): Promise<HomeSession | { error: string; status: number }> {
  const { data, error } = await supabase.rpc("ensure_home_member");
  if (error) {
    return {
      error: "unauthenticated",
      status: 401,
    };
  }

  const row = data as EnsureMemberRow | null;
  if (
    !row?.member_id ||
    !row.household_id ||
    !row.email ||
    !row.household_name
  ) {
    return { error: "unauthenticated", status: 401 };
  }

  return {
    memberId: row.member_id,
    householdId: row.household_id,
    email: row.email,
    householdName: row.household_name,
  };
}
