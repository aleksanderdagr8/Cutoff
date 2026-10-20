import { HouseholdPlanRequestSchema } from "@cutoff/contracts";
import { authenticateAgent } from "../auth.js";
import type { ApiBindings } from "../bindings.js";

/**
 * Start the $5/mo household plan (Stripe Checkout subscription).
 * Separate from per-order authorize/capture. No stored balance.
 */
export async function startHouseholdPlanHandler(
  bindings: ApiBindings,
  householdId: string,
  body: unknown,
  opts: {
    authorization?: string;
    memberId?: string;
    memberHouseholdId?: string;
  },
) {
  if (!bindings.pay.startHouseholdPlan) {
    return { error: "not_found" as const, status: 404 as const };
  }

  const allowed = await canStartPlan(bindings, householdId, opts);
  if (!allowed) {
    return { error: "unauthenticated" as const, status: 401 as const };
  }

  const parsed = HouseholdPlanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { error: "invalid_body" as const, status: 400 as const };
  }

  const session = await bindings.pay.startHouseholdPlan({
    householdId,
    email: parsed.data.email,
  });
  await bindings.households.setStripeCustomerId(householdId, session.customerId);
  return {
    customer_id: session.customerId,
    session_id: session.sessionId,
    checkout_url: session.url,
  };
}

async function canStartPlan(
  bindings: ApiBindings,
  householdId: string,
  opts: {
    authorization?: string;
    memberId?: string;
    memberHouseholdId?: string;
  },
): Promise<boolean> {
  if (opts.authorization) {
    const auth = await authenticateAgent(bindings, opts.authorization);
    if (!auth.ok || auth.agent.householdId !== householdId) return false;
    const household = await bindings.households.getHousehold(
      { role: "service_role" },
      householdId,
    );
    return Boolean(household);
  }
  if (opts.memberId && opts.memberHouseholdId) {
    const household = await bindings.households.getHousehold(
      {
        role: "member",
        memberId: opts.memberId,
        householdId: opts.memberHouseholdId,
      },
      householdId,
    );
    return Boolean(household);
  }
  return false;
}
