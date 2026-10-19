import { IssueAgentRequestSchema } from "@cutoff/contracts";
import { authenticateAgent } from "../auth.js";
import type { ApiBindings } from "../bindings.js";

/**
 * Unit 17: agent introspect (Bearer key → scopes).
 * Used by apps/mcp for scope-filtered tools/list. No secrets returned.
 */
export async function getAgentMeHandler(
  bindings: ApiBindings,
  authorization: string | undefined,
) {
  const auth = await authenticateAgent(bindings, authorization);
  if (!auth.ok) {
    return { error: auth.error, status: auth.status };
  }
  return {
    key_id: auth.agent.keyId,
    scopes: [...auth.agent.scopes],
    mandate_ids: [...auth.agent.mandateIds],
  };
}

/** Human/console: issue agent credential. Secret returned once. */
export async function issueAgentHandler(
  bindings: ApiBindings,
  householdId: string,
  body: unknown,
) {
  const parsed = IssueAgentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { error: "invalid_body" as const, status: 400 as const };
  }

  for (const mandateId of parsed.data.mandate_ids) {
    const mandate = await bindings.mandates.getForHousehold(mandateId, householdId);
    if (!mandate) {
      return { error: "mandate_miss" as const, status: 400 as const };
    }
  }

  try {
    const issued = await bindings.agents.issue({
      householdId,
      scopes: parsed.data.scopes,
      mandateIds: parsed.data.mandate_ids,
    });
    return {
      key_id: issued.keyId,
      secret: issued.secret,
      scopes: issued.scopes,
      mandate_ids: issued.mandateIds,
    };
  } catch {
    return { error: "invalid_body" as const, status: 400 as const };
  }
}

/** Human/console or operator: revoke key + KV fan-out. */
export async function revokeAgentHandler(
  bindings: ApiBindings,
  householdId: string,
  keyId: string,
) {
  const row = await bindings.agents.selectByKeyId(keyId);
  if (!row || row.householdId !== householdId) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }
  await bindings.agents.revoke(keyId);
  return { key_id: keyId, revoked: true as const };
}
