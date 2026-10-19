import type {
  FulfillAdapter,
  MemoryOutboundWebhookQueue,
  OfferFeedAdapter,
  PayAdapter,
  TaxAdapter,
} from "@cutoff/adapters";
import type {
  AgentCredentialRepository,
  MandateRepository,
  MemoryCatalogRepository,
  MemoryFulfillmentRepository,
  MemoryHouseholdRepository,
  MemoryListRepository,
  MemoryOfferRepository,
  MemoryReceiptRepository,
  MemoryRiskRepository,
  OrderRepository,
  PostgresHouseholdRepository,
  QuoteRepository,
  RevocationKv,
} from "@cutoff/db";

/**
 * Injected bindings. Worker handler stays a plain function of these deps.
 * Cloudflare secrets/bindings map into this shape at the edge entrypoint.
 */
export type ApiBindings = {
  pay: PayAdapter;
  fulfill: FulfillAdapter;
  tax: TaxAdapter;
  /** Primary aggregator feed. */
  offerFeed: OfferFeedAdapter;
  /** Phase 6: second source (brand feed) on top items. */
  brandOfferFeed: OfferFeedAdapter;
  orders: OrderRepository;
  households: MemoryHouseholdRepository | PostgresHouseholdRepository;
  agents: AgentCredentialRepository;
  mandates: MandateRepository;
  quotes: QuoteRepository;
  catalog: MemoryCatalogRepository;
  offers: MemoryOfferRepository;
  risk: MemoryRiskRepository;
  fulfillment: MemoryFulfillmentRepository;
  receipts: MemoryReceiptRepository;
  list: MemoryListRepository;
  outboundWebhooks: MemoryOutboundWebhookQueue;
  /** Shared secret for signing outbound + verifying inbound (injected). */
  webhookSecret: string;
  /** Buyer-agent webhook URL (injected). */
  webhookTargetUrl: string;
  revocationKv: RevocationKv;
  traceId: string;
  /** Injected clock for deterministic tests. */
  nowUtc: () => string;
};
