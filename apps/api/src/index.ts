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
import { createApp } from "./app.js";
import type { ApiBindings } from "./bindings.js";

/**
 * Cloudflare Workers entry. Bindings are built once per isolate and injected
 * into handlers as plain deps — handlers never reach for ambient globals.
 *
 * Phase 1 uses memory repos + fake pay/fulfill. Live Stripe/Supabase later.
 */
function buildBindings(): ApiBindings {
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
