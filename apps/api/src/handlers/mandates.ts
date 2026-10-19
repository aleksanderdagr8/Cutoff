import {
  AgentWidenMandateRequestSchema,
  CreateMandateRequestSchema,
  LowerCeilingRequestSchema,
} from "@cutoff/contracts";
import { agentMandateWidenDenied } from "@cutoff/domain";
import { authenticateAgent } from "../auth.js";
import type { ApiBindings } from "../bindings.js";

/** Human/console: create mandate on a household. */
export async function createMandateHandler(
  bindings: ApiBindings,
  householdId: string,
  body: unknown,
) {
  const parsed = CreateMandateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { error: "invalid_body" as const, status: 400 as const };
  }
  const household = bindings.households.getHousehold(
    { role: "service_role" },
    householdId,
  );
  if (!household) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }

  const row = bindings.mandates.create({
    householdId,
    ceilingCents: parsed.data.ceiling_cents,
    expiresAtUtc: parsed.data.expires_at,
    canonicalItemIds: parsed.data.canonical_item_ids,
    categoryAllowList: parsed.data.category_allow_list,
    neverSubstituteIds: parsed.data.never_substitute_ids,
    addressId: parsed.data.address_id,
    actorCap: parsed.data.actor_cap,
  });

  return {
    mandate_id: row.mandateId,
    household_id: row.householdId,
    ceiling_cents: row.ceilingCents,
    expires_at: row.expiresAtUtc,
    address_id: row.addressId,
    canonical_item_ids: row.canonicalItemIds,
  };
}

/** Human: lower ceiling only. */
export async function lowerCeilingHandler(
  bindings: ApiBindings,
  householdId: string,
  mandateId: string,
  body: unknown,
) {
  const parsed = LowerCeilingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { error: "invalid_body" as const, status: 400 as const };
  }
  const updated = bindings.mandates.lowerCeiling(
    mandateId,
    householdId,
    parsed.data.ceiling_cents,
  );
  if (!updated) {
    return { error: "mandate_miss" as const, status: 400 as const };
  }
  return {
    mandate_id: updated.mandateId,
    ceiling_cents: updated.ceilingCents,
  };
}

/** Agent attempts to widen mandate — always mandate_miss. */
export async function agentWidenMandateHandler(
  bindings: ApiBindings,
  mandateId: string,
  body: unknown,
  authorization: string | undefined,
) {
  const auth = await authenticateAgent(bindings, authorization);
  if (!auth.ok) {
    return { error: auth.error, status: auth.status };
  }

  const parsed = AgentWidenMandateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { error: "invalid_body" as const, status: 400 as const };
  }

  const denied = agentMandateWidenDenied({
    raiseCeiling: parsed.data.raise_ceiling,
    newCeilingCents: parsed.data.ceiling_cents,
    addAddress: parsed.data.add_address,
    newAddressId: parsed.data.address_id,
  });
  if (denied) {
    return { error: denied, status: 403 as const };
  }

  // Even an empty widen body is not a supported agent mutation.
  void mandateId;
  void auth;
  return { error: "mandate_miss" as const, status: 403 as const };
}
