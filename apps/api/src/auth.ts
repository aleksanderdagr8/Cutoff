import type { AuthenticatedAgent } from "@cutoff/db";
import type { ApiBindings } from "./bindings.js";

export type AgentAuthResult =
  | { ok: true; agent: AuthenticatedAgent }
  | { ok: false; error: "unauthenticated" | "revoked"; status: 401 };

/**
 * Parse `Authorization: Bearer ck_live_…` and authenticate via agents repo
 * (KV first, Postgres fallback).
 */
export async function authenticateAgent(
  bindings: ApiBindings,
  authorizationHeader: string | undefined,
): Promise<AgentAuthResult> {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return { ok: false, error: "unauthenticated", status: 401 };
  }
  const secret = authorizationHeader.slice("Bearer ".length).trim();
  const result = await bindings.agents.authenticate(secret);
  if (!result.ok) {
    return { ok: false, error: result.error, status: 401 };
  }
  return { ok: true, agent: result.agent };
}
