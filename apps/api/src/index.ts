import {
  FakeAggregatorOfferAdapter,
  FakeBrandFeedOfferAdapter,
  FakeFulfillAdapter,
  FakePayAdapter,
  FakeTaxAdapter,
  MemoryOutboundWebhookQueue,
} from "@cutoff/adapters";
import {
  createRepos,
  resolveReposModeFromEnv,
} from "@cutoff/db";
import { createApp } from "./app.js";
import type { ApiBindings } from "./bindings.js";

/**
 * Cloudflare Workers entry. Bindings are built once per isolate and injected
 * into handlers as plain deps — handlers never reach for ambient globals.
 *
 * Repos: memory by default; Postgres when SUPABASE_URL + SUPABASE_SERVICE_ROLE
 * are set (see createRepos / docs).
 */
function buildBindings(): ApiBindings {
  const pay = new FakePayAdapter();
  const repos = createRepos({
    mode: resolveReposModeFromEnv(),
    pay,
  });
  return {
    pay,
    fulfill: new FakeFulfillAdapter(),
    tax: new FakeTaxAdapter(),
    offerFeed: new FakeAggregatorOfferAdapter(),
    brandOfferFeed: new FakeBrandFeedOfferAdapter(),
    orders: repos.orders,
    households: repos.households,
    agents: repos.agents,
    mandates: repos.mandates,
    quotes: repos.quotes,
    catalog: repos.catalog,
    offers: repos.offers,
    risk: repos.risk,
    fulfillment: repos.fulfillment,
    receipts: repos.receipts,
    list: repos.list,
    nudgeSettings: repos.nudgeSettings,
    reorderNudges: repos.reorderNudges,
    outboundWebhooks: new MemoryOutboundWebhookQueue(),
    webhookSecret: "whsec_dev_replace_me",
    webhookTargetUrl: "https://example.invalid/webhooks/cutoff",
    revocationKv: repos.revocationKv,
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
