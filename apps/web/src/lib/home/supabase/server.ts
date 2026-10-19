import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { readSupabasePublicEnv } from "./env";

export async function createHomeServerClient() {
  const env = readSupabasePublicEnv();
  if (!env) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required");
  }

  const jar = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            jar.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — middleware keeps the session fresh.
        }
      },
    },
  });
}
