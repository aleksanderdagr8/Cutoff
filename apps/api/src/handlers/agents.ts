import { IssueAgentRequestSchema } from "@cutoff/contracts";
import type { ApiBindings } from "../bindings.js";

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
