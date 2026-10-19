import {
  FakeAggregatorOfferAdapter,
  FakeFulfillAdapter,
  FakePayAdapter,
  FakeTaxAdapter,
} from "@cutoff/adapters";
import {
  MemoryAgentCredentialRepository,
  MemoryHouseholdRepository,
  MemoryMandateRepository,
  MemoryOfferRepository,
  MemoryOrderRepository,
  MemoryQuoteRepository,
  MemoryRevocationKv,
  seedDualFulfillerOffers,
  seedFixtureCatalog,
} from "@cutoff/db";
import { createApp } from "./app.js";
import type { ApiBindings } from "./bindings.js";

/**
 * Cloudflare Workers entry. Bindings are built once per isolate and injected
 * into handlers as plain deps — handlers never reach for ambient globals.
 *
 * Phase 2 uses memory repos + fake pay/fulfill/offer feed. Live adapters later.
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
