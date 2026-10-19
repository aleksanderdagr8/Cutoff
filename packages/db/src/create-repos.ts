import type { PayAdapter } from "@cutoff/adapters";
import {
  MemoryAgentCredentialRepository,
  type AgentCredentialRepository,
} from "./agents.js";
import {
  MemoryCatalogRepository,
  seedFixtureCatalog,
} from "./catalog.js";
import { MemoryFulfillmentRepository } from "./fulfillment.js";
import { MemoryHouseholdRepository } from "./households.js";
import { MemoryRevocationKv, type RevocationKv } from "./kv.js";
import {
  MemoryListRepository,
  type ListRepository,
} from "./list.js";
import {
  MemoryMandateRepository,
  type MandateRepository,
} from "./mandates.js";
import {
  MemoryHouseholdNudgeSettingsRepository,
  MemoryReorderNudgeRepository,
  type HouseholdNudgeSettingsRepository,
  type ReorderNudgeRepository,
} from "./nudges.js";
import {
  MemoryQuoteNudgeLinkStore,
  type QuoteNudgeLinkStore,
} from "./quote-nudge-links.js";
import {
  MemoryOfferRepository,
  seedBrandFeedTopOffers,
  seedDualFulfillerOffers,
} from "./offers.js";
import {
  MemoryOrderRepository,
  type OrderRepository,
} from "./orders.js";
import { PostgresAgentCredentialRepository } from "./postgres/agents.js";
import { PostgresHouseholdRepository } from "./postgres/households.js";
import { PostgresListRepository } from "./postgres/list.js";
import { PostgresMandateRepository } from "./postgres/mandates.js";
import {
  PostgresHouseholdNudgeSettingsRepository,
  PostgresReorderNudgeRepository,
} from "./postgres/nudges.js";
import { PostgresOrderRepository } from "./postgres/orders.js";
import { PostgresQuoteRepository } from "./postgres/quotes.js";
import {
  MemoryQuoteRepository,
  type QuoteRepository,
} from "./quotes.js";
import { MemoryReceiptRepository } from "./receipts.js";
import { MemoryRiskRepository } from "./risk.js";
import {
  createServiceSupabaseClient,
  hasSupabaseServiceEnv,
  readSupabaseServiceEnv,
  type CutoffSupabaseClient,
} from "./supabase-client.js";

export type ReposMode = "memory" | "postgres";

export type CreateReposOptions = {
  /** Default `memory` (CI / unit tests). */
  mode?: ReposMode;
  pay: PayAdapter;
  revocationKv?: RevocationKv;
  /** Required when mode is `postgres` unless env provides URL + service role. */
  supabase?: CutoffSupabaseClient;
  /** Env used to resolve the service client when `supabase` is omitted. */
  env?: Record<string, string | undefined>;
  /** Seed fixture catalog + dual fulfiller offers (memory path). Default true. */
  seedCatalogOffers?: boolean;
};

export type CutoffRepos = {
  mode: ReposMode;
  orders: OrderRepository;
  quotes: QuoteRepository;
  mandates: MandateRepository;
  agents: AgentCredentialRepository;
  /** Memory in memory mode; thin Postgres stub when mode is postgres. */
  households: MemoryHouseholdRepository | PostgresHouseholdRepository;
  catalog: MemoryCatalogRepository;
  offers: MemoryOfferRepository;
  risk: MemoryRiskRepository;
  fulfillment: MemoryFulfillmentRepository;
  receipts: MemoryReceiptRepository;
  list: ListRepository;
  nudgeSettings: HouseholdNudgeSettingsRepository;
  reorderNudges: ReorderNudgeRepository;
  quoteNudgeLinks: QuoteNudgeLinkStore;
  revocationKv: RevocationKv;
  supabase: CutoffSupabaseClient | null;
};

/**
 * Env-driven mode: `postgres` when SUPABASE_URL + SUPABASE_SERVICE_ROLE are set,
 * otherwise `memory`. Explicit `createRepos({ mode })` always wins at the call site.
 */
export function resolveReposModeFromEnv(
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
): ReposMode {
  return hasSupabaseServiceEnv(env) ? "postgres" : "memory";
}

/**
 * Build repository bag. Unit tests / CI: `{ mode: "memory", pay }`.
 * Live Worker: `createRepos({ mode: resolveReposModeFromEnv(), pay, ... })`.
 */
export function createRepos(options: CreateReposOptions): CutoffRepos {
  const mode = options.mode ?? "memory";
  const revocationKv = options.revocationKv ?? new MemoryRevocationKv();
  const seed = options.seedCatalogOffers !== false;

  const catalog = seed ? seedFixtureCatalog() : new MemoryCatalogRepository();
  const offers = seed
    ? seedDualFulfillerOffers(new MemoryOfferRepository())
    : new MemoryOfferRepository();
  if (seed) {
    seedBrandFeedTopOffers(offers);
  }

  if (mode === "memory") {
    return {
      mode,
      orders: new MemoryOrderRepository(options.pay),
      quotes: new MemoryQuoteRepository(),
      mandates: new MemoryMandateRepository(),
      agents: new MemoryAgentCredentialRepository(revocationKv),
      households: new MemoryHouseholdRepository(),
      catalog,
      offers,
      risk: new MemoryRiskRepository(),
      fulfillment: new MemoryFulfillmentRepository(),
      receipts: new MemoryReceiptRepository(),
      list: new MemoryListRepository(),
      nudgeSettings: new MemoryHouseholdNudgeSettingsRepository(),
      reorderNudges: new MemoryReorderNudgeRepository(),
      quoteNudgeLinks: new MemoryQuoteNudgeLinkStore(),
      revocationKv,
      supabase: null,
    };
  }

  const supabase =
    options.supabase ??
    (() => {
      const cfg = readSupabaseServiceEnv(
        options.env ?? (process.env as Record<string, string | undefined>),
      );
      if (!cfg) {
        throw new Error(
          "createRepos({ mode: \"postgres\" }) requires SUPABASE_URL + SUPABASE_SERVICE_ROLE or an explicit supabase client",
        );
      }
      return createServiceSupabaseClient(cfg);
    })();

  return {
    mode,
    orders: new PostgresOrderRepository(supabase, options.pay),
    quotes: new PostgresQuoteRepository(supabase),
    mandates: new PostgresMandateRepository(supabase),
    agents: new PostgresAgentCredentialRepository(supabase, revocationKv),
    households: new PostgresHouseholdRepository(supabase),
    catalog,
    offers,
    risk: new MemoryRiskRepository(),
    fulfillment: new MemoryFulfillmentRepository(),
    receipts: new MemoryReceiptRepository(),
    list: new PostgresListRepository(supabase),
    nudgeSettings: new PostgresHouseholdNudgeSettingsRepository(supabase),
    reorderNudges: new PostgresReorderNudgeRepository(supabase),
    quoteNudgeLinks: new MemoryQuoteNudgeLinkStore(),
    revocationKv,
    supabase,
  };
}
