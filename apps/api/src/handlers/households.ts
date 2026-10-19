import { CreateHouseholdRequestSchema } from "@cutoff/contracts";
import { authenticateAgent } from "../auth.js";
import type { ApiBindings } from "../bindings.js";

/**
 * Human/console path (service role). Creates a household + first member.
 * Browser never holds the service role — see web bundle test.
 */
export async function createHouseholdHandler(
  bindings: ApiBindings,
  body: unknown,
) {
  const parsed = CreateHouseholdRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { error: "invalid_body" as const, status: 400 as const };
  }
  const { household, member } = bindings.households.createHousehold(
    parsed.data.name,
    parsed.data.member_email,
  );
  return {
    household_id: household.householdId,
    name: household.name,
    member_id: member.memberId,
    member_email: member.email,
  };
}

/**
 * Read household. Agent Bearer may only read its own household.
 * Member session (test) uses RLS-shaped getHousehold.
 */
export async function getHouseholdHandler(
  bindings: ApiBindings,
  householdId: string,
  opts: {
    authorization?: string;
    memberId?: string;
    memberHouseholdId?: string;
  },
) {
  if (opts.authorization) {
    const auth = await authenticateAgent(bindings, opts.authorization);
    if (!auth.ok) {
      return { error: auth.error, status: auth.status };
    }
    if (auth.agent.householdId !== householdId) {
      return { error: "unauthenticated" as const, status: 401 as const };
    }
    const household = bindings.households.getHousehold(
      { role: "service_role" },
      householdId,
    );
    if (!household) {
      return { error: "unauthenticated" as const, status: 401 as const };
    }
    return {
      household_id: household.householdId,
      name: household.name,
    };
  }

  if (opts.memberId && opts.memberHouseholdId) {
    const household = bindings.households.getHousehold(
      {
        role: "member",
        memberId: opts.memberId,
        householdId: opts.memberHouseholdId,
      },
      householdId,
    );
    if (!household) {
      return { error: "unauthenticated" as const, status: 401 as const };
    }
    return {
      household_id: household.householdId,
      name: household.name,
    };
  }

  return { error: "unauthenticated" as const, status: 401 as const };
}
