import type { FulfillAdapter, PayAdapter, TaxAdapter } from "@cutoff/adapters";
import type { MemoryOrderRepository } from "@cutoff/db";

/**
 * Injected bindings. Worker handler stays a plain function of these deps.
 * Cloudflare secrets/bindings map into this shape at the edge entrypoint.
 */
export type ApiBindings = {
  pay: PayAdapter;
  fulfill: FulfillAdapter;
  tax: TaxAdapter;
  orders: MemoryOrderRepository;
  traceId: string;
};
