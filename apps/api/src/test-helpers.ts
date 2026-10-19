import {
  FakeAggregatorOfferAdapter,
  FakeBrandFeedOfferAdapter,
  FakeEmailNotifyAdapter,
  FakeFulfillAdapter,
  FakePayAdapter,
  FakeTaxAdapter,
  MemoryOutboundWebhookQueue,
  MemorySecretStore,
} from "@cutoff/adapters";
import {
  MemoryAgentCredentialRepository,
  MemoryFulfillmentRepository,
  MemoryHouseholdRepository,
  MemoryHouseholdNudgeSettingsRepository,
  MemoryListRepository,
  MemoryMandateRepository,
  MemoryOfferRepository,
  MemoryOrderRepository,
  MemoryQuoteNudgeLinkStore,
  MemoryQuoteRepository,
  MemoryReceiptRepository,
  MemoryReorderNudgeRepository,
  MemoryRevocationKv,
  MemoryRiskRepository,
  seedBrandFeedTopOffers,
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

/** CI / unit tests always use memory repositories. */
export type TestBindings = Omit<
  ApiBindings,
  "orders" | "households" | "agents" | "mandates" | "quotes" | "revocationKv"
> & {
  orders: MemoryOrderRepository;
  households: MemoryHouseholdRepository;
  agents: MemoryAgentCredentialRepository;
  mandates: MemoryMandateRepository;
  quotes: MemoryQuoteRepository;
  revocationKv: MemoryRevocationKv;
};

export function testBindings(
  overrides: Partial<Pick<ApiBindings, "nowUtc" | "fulfill">> = {},
): TestBindings {
  const pay = new FakePayAdapter();
  const revocationKv = new MemoryRevocationKv();
  const catalog = seedFixtureCatalog();
  const offers = seedDualFulfillerOffers(new MemoryOfferRepository(), {
    nowUtc: "2026-10-19T12:00:00.000Z",
  });
  // Phase 6: second source on top items (priced above A so A still wins by default).
  seedBrandFeedTopOffers(offers, {
    nowUtc: "2026-10-19T12:00:00.000Z",
  });
  return {
    pay,
    fulfill: overrides.fulfill ?? new FakeFulfillAdapter(),
    tax: new FakeTaxAdapter(),
    offerFeed: new FakeAggregatorOfferAdapter(),
    brandOfferFeed: new FakeBrandFeedOfferAdapter(),
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
    nudgeSettings: new MemoryHouseholdNudgeSettingsRepository(),
    reorderNudges: new MemoryReorderNudgeRepository(),
    quoteNudgeLinks: new MemoryQuoteNudgeLinkStore(),
    outboundWebhooks: new MemoryOutboundWebhookQueue(),
    nudgeQueue: new MemoryOutboundWebhookQueue(),
    emailNotify: new FakeEmailNotifyAdapter(),
    secrets: new MemorySecretStore(),
    webhookSecret: TEST_WEBHOOK_SECRET,
    webhookTargetUrl: "https://buyer-agent.example/webhooks/cutoff",
    revocationKv,
    traceId: "trace_test",
    nowUtc: overrides.nowUtc ?? (() => "2026-10-19T12:00:00.000Z"),
  };
}

export async function seedHouseholdWithMandateAndAgent(
  bindings: TestBindings,
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
  const { household, member } = await bindings.households.createHousehold(
    "Test Home",
    "a@example.com",
  );
  const mandate = await bindings.mandates.create({
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
