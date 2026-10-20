import type { HealthResponse } from "@cutoff/contracts";

export type HealthInput = {
  /** Production worker (`CUTOFF_ENV=production`). Local and tests are not. */
  production?: boolean;
  reposMode?: "memory" | "postgres";
  /** True while fulfill/tax/offer/email are fake adapters. */
  fakeIntegrations?: boolean;
  /** Stripe when the pay adapter is the real one. */
  payments?: "stripe" | "fake";
};

/**
 * Public liveness. In production, memory repos or fake integrations are
 * unhealthy (503). Local tests and `wrangler dev` stay ok.
 */
export function healthHandler(input: HealthInput = {}): HealthResponse {
  const production = input.production === true;
  const reposMode = input.reposMode ?? "memory";
  const fakeIntegrations = input.fakeIntegrations !== false;
  const payments = input.payments ?? "fake";
  const reasons: string[] = [];
  if (production && reposMode !== "postgres") {
    reasons.push("memory_repos");
  }
  if (production && fakeIntegrations) {
    reasons.push("fake_integrations");
  }
  if (reasons.length === 0) {
    return {
      ok: true,
      service: "cutoff-api",
      phase: "6",
    };
  }
  return {
    ok: false,
    service: "cutoff-api",
    phase: "6",
    repos: reposMode,
    integrations: fakeIntegrations ? "fake" : "live",
    ...(payments === "stripe" ? { payments: "stripe" as const } : {}),
    reasons,
  };
}
