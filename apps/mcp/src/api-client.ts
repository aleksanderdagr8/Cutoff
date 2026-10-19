/**
 * HTTP client over the cutoff-api service binding.
 * Forwards Authorization unchanged. Never holds DB credentials.
 */

import { AgentMeResponseSchema } from "@cutoff/contracts";
import type { AgentScope } from "@cutoff/domain";
import type { ApiService } from "./bindings.js";

export type AgentMe = {
  keyId: string;
  scopes: AgentScope[];
  mandateIds: string[];
};

export async function fetchAgentMe(
  api: ApiService,
  authorization: string,
): Promise<
  | { ok: true; me: AgentMe }
  | { ok: false; status: number; error: string }
> {
  const res = await api.fetch("https://cutoff-api.internal/v1/agent/me", {
    method: "GET",
    headers: { Authorization: authorization },
  });
  const body = (await res.json().catch(() => null)) as {
    error?: string;
  } | null;
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: body?.error ?? "unauthenticated",
    };
  }
  const parsed = AgentMeResponseSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 502, error: "invalid_body" };
  }
  return {
    ok: true,
    me: {
      keyId: parsed.data.key_id,
      scopes: parsed.data.scopes,
      mandateIds: parsed.data.mandate_ids,
    },
  };
}

/** Passthrough helper for later units (quote/commit/list). */
export async function apiFetch(
  api: ApiService,
  path: string,
  init: RequestInit & { authorization: string },
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", init.authorization);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const { authorization: _a, ...rest } = init;
  return api.fetch(`https://cutoff-api.internal${path}`, {
    ...rest,
    headers,
  });
}
