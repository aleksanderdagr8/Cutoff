import {
  FakeAggregatorOfferAdapter,
  FakeFulfillAdapter,
  FakePayAdapter,
  FakeTaxAdapter,
  MemoryOutboundWebhookQueue,
} from "@cutoff/adapters";
import {
  MemoryAgentCredentialRepository,
  MemoryFulfillmentRepository,
  MemoryHouseholdRepository,
  MemoryListRepository,
  MemoryMandateRepository,
  MemoryOfferRepository,
  MemoryOrderRepository,
  MemoryQuoteRepository,
  MemoryReceiptRepository,
  MemoryRevocationKv,
  MemoryRiskRepository,
  seedDualFulfillerOffers,
  seedFixtureCatalog,
} from "@cutoff/db";
import type { ApiBindings } from "./bindings.js";

/** Default evidence fields for commit bodies (Unit 8). */
export const defaultCommitEvidence = {
  actor_chain: ["buyer_agent", "cutoff"],
  protocol: "cutoff.v1",
} as const;

export const TEST_WEBHOOK_SECRET = "whsec_test_cutoff_phase4";

export function testBindings(
  overrides: Partial<Pick<ApiBindings, "nowUtc" | "fulfill">> = {},
): ApiBindings {
  const pay = new FakePayAdapter();
  const revocationKv = new MemoryRevocationKv();
  const catalog = seedFixtureCatalog();
  const offers = seedDualFulfillerOffers(new MemoryOfferRepository(), {
    nowUtc: "2026-10-19T12:00:00.000Z",
  });
  return {
    pay,
    fulfill: overrides.fulfill ?? new FakeFulfillAdapter(),
    tax: new FakeTaxAdapter(),
    offerFeed: new FakeAggregatorOfferAdapter(),
    orders: new MemoryOrderRepository(pay),
    households: new MemoryHouseholdRepository(),
    agents: new MemoryAgentCredentialRepository(revocationKv),
    mandates: new MemoryMandateRepository(),
    quotes: new MemoryQuoteRepository(),
    catalog,
    offers,
    risk: new MemoryRiskRepository(),
    fulfillment: new MemoryFulfillmentRepository(),
    receipts: new MemoryReceiptRepository(),
    list: new MemoryListRepository(),
    outboundWebhooks: new MemoryOutboundWebhookQueue(),
    webhookSecret: TEST_WEBHOOK_SECRET,
    webhookTargetUrl: "https://buyer-agent.example/webhooks/cutoff",
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
    neverSubstitute?: boolean;
    scopes?: Array<"quote" | "commit" | "read_list">;
    allowCancel?: boolean;
  } = {},
) {
  const itemId = opts.itemId ?? "item_towels_12";
  const { household, member } = bindings.households.createHousehold(
    "Test Home",
    "a@example.com",
  );
  const mandate = bindings.mandates.create({
    householdId: household.householdId,
    ceilingCents: opts.ceilingCents ?? 2000,
    expiresAtUtc: opts.expiresAt ?? "2026-12-01T00:00:00.000Z",
    canonicalItemIds: [itemId],
    neverSubstituteIds:
      opts.neverSubstitute === false ? [] : [itemId],
    addressId: "addr_home",
    allowCancel: opts.allowCancel ?? false,
  });
  const agent = await bindings.agents.issue({
    householdId: household.householdId,
    scopes: opts.scopes ?? ["quote", "commit", "read_list"],
    mandateIds: [mandate.mandateId],
  });
  return { household, member, mandate, agent };
}
