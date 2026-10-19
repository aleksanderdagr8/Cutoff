import {
  FakeFulfillAdapter,
  FakePayAdapter,
  FakeTaxAdapter,
} from "@cutoff/adapters";
import {
  MemoryAgentCredentialRepository,
  MemoryHouseholdRepository,
  MemoryMandateRepository,
  MemoryOrderRepository,
  MemoryRevocationKv,
  MemoryStubQuoteRepository,
} from "@cutoff/db";
import type { ApiBindings } from "./bindings.js";

export function testBindings(
  overrides: Partial<Pick<ApiBindings, "nowUtc">> = {},
): ApiBindings {
  const pay = new FakePayAdapter();
  const revocationKv = new MemoryRevocationKv();
  return {
    pay,
    fulfill: new FakeFulfillAdapter(),
    tax: new FakeTaxAdapter(),
    orders: new MemoryOrderRepository(pay),
    households: new MemoryHouseholdRepository(),
    agents: new MemoryAgentCredentialRepository(revocationKv),
    mandates: new MemoryMandateRepository(),
    quotes: new MemoryStubQuoteRepository(),
    revocationKv,
    traceId: "trace_test",
    nowUtc: overrides.nowUtc ?? (() => "2026-10-19T12:00:00.000Z"),
  };
}

export async function seedHouseholdWithMandateAndAgent(
  bindings: ApiBindings,
  opts: {
    ceilingCents?: number;
    expiresAt?: string;
    itemId?: string;
    scopes?: Array<"quote" | "commit" | "read_list">;
  } = {},
) {
  const { household, member } = bindings.households.createHousehold(
    "Test Home",
    "a@example.com",
  );
  const mandate = bindings.mandates.create({
    householdId: household.householdId,
    ceilingCents: opts.ceilingCents ?? 2000,
    expiresAtUtc: opts.expiresAt ?? "2026-12-01T00:00:00.000Z",
    canonicalItemIds: [opts.itemId ?? "item_towels_12"],
    neverSubstituteIds: [opts.itemId ?? "item_towels_12"],
    addressId: "addr_home",
  });
  const agent = await bindings.agents.issue({
    householdId: household.householdId,
    scopes: opts.scopes ?? ["quote", "commit", "read_list"],
    mandateIds: [mandate.mandateId],
  });
  return { household, member, mandate, agent };
}
