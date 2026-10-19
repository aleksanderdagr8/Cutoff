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
import { createApp } from "./app.js";
import type { ApiBindings } from "./bindings.js";

/**
 * Cloudflare Workers entry. Bindings are built once per isolate and injected
 * into handlers as plain deps — handlers never reach for ambient globals.
 *
 * Phase 5 uses memory repos + fake pay/fulfill/notify + receipt + list.
 */
function buildBindings(): ApiBindings {
  const pay = new FakePayAdapter();
  const revocationKv = new MemoryRevocationKv();
  const catalog = seedFixtureCatalog();
  const offers = seedDualFulfillerOffers(new MemoryOfferRepository());
  return {
    pay,
    fulfill: new FakeFulfillAdapter(),
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
    webhookSecret: "whsec_dev_replace_me",
    webhookTargetUrl: "https://example.invalid/webhooks/cutoff",
    revocationKv,
    traceId: crypto.randomUUID(),
    nowUtc: () => new Date().toISOString(),
  };
}

const app = createApp();
const bindings = buildBindings();

export default {
  async fetch(
    request: Request,
    _env: unknown,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    return app.fetch(request, bindings);
  },
};
