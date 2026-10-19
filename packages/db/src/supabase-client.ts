import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type CutoffSupabaseClient = SupabaseClient;

export type SupabaseEnv = {
  url: string;
  serviceRoleKey: string;
};

/**
 * Read Worker/server env for the service-role client.
 * Never call from browser code — service role bypasses RLS.
 */
export type EnvMap = Record<string, string | undefined>;

export function readSupabaseServiceEnv(
  env: EnvMap = process.env as EnvMap,
): SupabaseEnv | null {
  const url = env.SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE?.trim();
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

/** True when both SUPABASE_URL and SUPABASE_SERVICE_ROLE are set. */
export function hasSupabaseServiceEnv(env: EnvMap = process.env as EnvMap): boolean {
  return readSupabaseServiceEnv(env) !== null;
}

export function createServiceSupabaseClient(
  config: SupabaseEnv,
): CutoffSupabaseClient {
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
