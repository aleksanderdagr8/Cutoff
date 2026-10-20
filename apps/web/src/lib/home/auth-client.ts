import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { HouseholdAuthClient } from "./auth-flow";

export function householdAuthClient(supabase: SupabaseClient): HouseholdAuthClient {
  return {
    signInWithPassword: (input) => supabase.auth.signInWithPassword(input),
    signUp: async (input) => {
      const { data, error } = await supabase.auth.signUp(input);
      return { data, error };
    },
    reauthenticate: () => supabase.auth.reauthenticate(),
    resetPasswordForEmail: (email, opts) =>
      supabase.auth.resetPasswordForEmail(email, opts),
    updateUser: (input) => supabase.auth.updateUser(input),
    signOut: () => supabase.auth.signOut(),
    verifyOtp: (input) => supabase.auth.verifyOtp(input),
    exchangeCodeForSession: (code) => supabase.auth.exchangeCodeForSession(code),
    rpc: async (fn, args) => {
      const { data, error } = await supabase.rpc(fn, args);
      return { data, error };
    },
  };
}
