import {
  FakeAggregatorOfferAdapter,
  FakeBrandFeedOfferAdapter,
  FakeEmailNotifyAdapter,
  FakeFulfillAdapter,
  FakePayAdapter,
  FakeTaxAdapter,
  MemoryOutboundWebhookQueue,
  MemorySecretStore,
  type NudgeQueue,
  type NudgeQueueJob,
  type OutboundWebhookJob,
} from "@cutoff/adapters";
import {
  createRepos,
  resolveReposModeFromEnv,
} from "@cutoff/db";
import { createApp } from "./app.js";
import type { ApiBindings } from "./bindings.js";
import { runNudgeCron } from "./handlers/nudge-cron.js";
import { deliverNudgeJob, processPendingNudges } from "./handlers/nudge-deliver.js";

type WorkerEnv = {
  NUDGE_QUEUE?: {
    send(body: unknown): Promise<void>;
  };
  WEBHOOK_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE?: string;
};

class CfNudgeQueue implements NudgeQueue {
  constructor(private readonly queue: { send(body: unknown): Promise<void> }) {}

  enqueue(job: NudgeQueueJob): void {
    const body: OutboundWebhookJob = {
      deliveryId: job.deliveryId ?? crypto.randomUUID(),
      url: job.url,
      eventType: job.eventType,
      body: job.body,
      createdAtUtc: job.createdAtUtc,
    };
    void this.queue.send(body);
  }
}

/**
 * Cloudflare Workers entry. Bindings are built once per isolate and injected
 * into handlers as plain deps — handlers never reach for ambient globals.
 *
 * Repos: memory by default; Postgres when SUPABASE_URL + SUPABASE_SERVICE_ROLE
 * are set (see createRepos / docs).
 *
 * Critical: do NOT rebuild memory repos on every fetch — quote then commit
 * across two HTTP requests would see empty state. Cache per isolate; Postgres
 * is durable across isolates once secrets are set.
 */
type IsolateCache = {
  key: string;
  bindings: ApiBindings;
  memoryNudgeQueue: MemoryOutboundWebhookQueue;
};

let isolateCache: IsolateCache | null = null;

function reposCacheKey(env?: WorkerEnv): string {
  const mode = resolveReposModeFromEnv({
    SUPABASE_URL: env?.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE: env?.SUPABASE_SERVICE_ROLE,
  });
  if (mode === "postgres") {
    return `postgres:${env?.SUPABASE_URL ?? ""}`;
  }
  return "memory";
}

function buildBindings(env?: WorkerEnv): ApiBindings {
  const key = reposCacheKey(env);
  if (isolateCache && isolateCache.key === key) {
    return {
      ...isolateCache.bindings,
      // Fresh outbound queue instance name stays shared via nudgeQueue binding.
      nudgeQueue: env?.NUDGE_QUEUE
        ? new CfNudgeQueue(env.NUDGE_QUEUE)
        : isolateCache.bindings.nudgeQueue,
      traceId: crypto.randomUUID(),
      nowUtc: () => new Date().toISOString(),
    };
  }

  const pay = new FakePayAdapter();
  const repos = createRepos({
    mode: resolveReposModeFromEnv({
      SUPABASE_URL: env?.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE: env?.SUPABASE_SERVICE_ROLE,
    }),
    pay,
    env: {
      SUPABASE_URL: env?.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE: env?.SUPABASE_SERVICE_ROLE,
    },
  });
  const memoryNudgeQueue = new MemoryOutboundWebhookQueue();
  const bindings: ApiBindings = {
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
    quoteNudgeLinks: repos.quoteNudgeLinks,
    outboundWebhooks: new MemoryOutboundWebhookQueue(),
    nudgeQueue: env?.NUDGE_QUEUE
      ? new CfNudgeQueue(env.NUDGE_QUEUE)
      : memoryNudgeQueue,
    emailNotify: new FakeEmailNotifyAdapter(),
    secrets: new MemorySecretStore(),
    webhookSecret: env?.WEBHOOK_SECRET ?? "whsec_dev_replace_me",
    webhookTargetUrl: "https://example.invalid/webhooks/cutoff",
    revocationKv: repos.revocationKv,
    traceId: crypto.randomUUID(),
    nowUtc: () => new Date().toISOString(),
  };
  isolateCache = { key, bindings, memoryNudgeQueue };
  return bindings;
}

/** Test-only: drop isolate cache so unit tests stay isolated. */
export function resetApiIsolateCacheForTests(): void {
  isolateCache = null;
}

/** Test-only: build (or reuse) Worker bindings. */
export function buildWorkerBindingsForTests(env?: WorkerEnv): ApiBindings {
  return buildBindings(env);
}

const app = createApp();

export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    return app.fetch(request, buildBindings(env));
  },

  /** Unit 20: every 15m — write idempotent nudge rows + enqueue. */
  async scheduled(
    _controller: ScheduledController,
    env: WorkerEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const bindings = buildBindings(env);
    await runNudgeCron(bindings);
    // Memory path (no CF Queue binding): deliver in-process. Unit 21 CF consumer otherwise.
    if (!env?.NUDGE_QUEUE) {
      await processPendingNudges(bindings);
    }
  },

  /** Unit 21: cutoff-nudges consumer — signed webhook / email + attempts. */
  async queue(
    batch: MessageBatch<OutboundWebhookJob>,
    env: WorkerEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const bindings = buildBindings(env);
    for (const msg of batch.messages) {
      const job = msg.body;
      const result = await deliverNudgeJob(bindings, job);
      if (result.ok) {
        msg.ack();
      } else {
        msg.retry();
      }
    }
  },
};
