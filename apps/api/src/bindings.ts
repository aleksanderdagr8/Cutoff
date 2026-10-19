import type {
  EmailNotifyAdapter,
  FulfillAdapter,
  MemoryOutboundWebhookQueue,
  NudgeQueue,
  OfferFeedAdapter,
  PayAdapter,
  SecretStore,
  TaxAdapter,
} from "@cutoff/adapters";
import type {
  AgentCredentialRepository,
  HouseholdNudgeSettingsRepository,
  ListRepository,
  MandateRepository,
  MemoryCatalogRepository,
  MemoryFulfillmentRepository,
  MemoryHouseholdRepository,
  MemoryOfferRepository,
  MemoryReceiptRepository,
  MemoryRiskRepository,
  OrderRepository,
  PostgresHouseholdRepository,
  QuoteNudgeLinkStore,
  QuoteRepository,
  ReorderNudgeRepository,
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
  list: ListRepository;
  nudgeSettings: HouseholdNudgeSettingsRepository;
  reorderNudges: ReorderNudgeRepository;
  quoteNudgeLinks: QuoteNudgeLinkStore;
  outboundWebhooks: MemoryOutboundWebhookQueue;
  /** Unit 20–21: reorder nudge queue (CF Queue or memory). */
  nudgeQueue: NudgeQueue;
  /** Unit 21: household email for reorder.due. */
  emailNotify: EmailNotifyAdapter;
  /** Unit 21: resolve agent_webhook_secret_ref. */
  secrets: SecretStore;
  /**
   * Optional fetch override for agent webhook POST (tests).
   * Defaults to global fetch.
   */
  nudgeFetch?: typeof fetch;
  /** Shared secret for signing outbound + verifying inbound (injected). */
  webhookSecret: string;
  /** Buyer-agent webhook URL (injected). */
  webhookTargetUrl: string;
  revocationKv: RevocationKv;
  traceId: string;
  /** Injected clock for deterministic tests. */
  nowUtc: () => string;
};
