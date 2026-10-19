import type {
  FulfillAdapter,
  MemoryOutboundWebhookQueue,
  OfferFeedAdapter,
  PayAdapter,
  TaxAdapter,
} from "@cutoff/adapters";
import type {
  MemoryAgentCredentialRepository,
  MemoryCatalogRepository,
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
} from "@cutoff/db";

/**
 * Injected bindings. Worker handler stays a plain function of these deps.
 * Cloudflare secrets/bindings map into this shape at the edge entrypoint.
 */
export type ApiBindings = {
  pay: PayAdapter;
  fulfill: FulfillAdapter;
  tax: TaxAdapter;
  offerFeed: OfferFeedAdapter;
  orders: MemoryOrderRepository;
  households: MemoryHouseholdRepository;
  agents: MemoryAgentCredentialRepository;
  mandates: MemoryMandateRepository;
  quotes: MemoryQuoteRepository;
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
  revocationKv: MemoryRevocationKv;
  traceId: string;
  /** Injected clock for deterministic tests. */
  nowUtc: () => string;
};
