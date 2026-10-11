import {
  FakeFulfillAdapter,
  FakePayAdapter,
  FakeTaxAdapter,
} from "@cutoff/adapters";
import { MemoryOrderRepository } from "@cutoff/db";
import { createApp } from "./app.js";
import type { ApiBindings } from "./bindings.js";

/**
 * Cloudflare Workers entry. Bindings are built once per isolate and injected
 * into handlers as plain deps — handlers never reach for ambient globals.
 *
 * Phase 0 uses fakes only. Live Stripe/Supabase/aggregator arrive later.
 */
function buildBindings(): ApiBindings {
  const pay = new FakePayAdapter();
  return {
    pay,
    fulfill: new FakeFulfillAdapter(),
    tax: new FakeTaxAdapter(),
    orders: new MemoryOrderRepository(pay),
    traceId: crypto.randomUUID(),
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
