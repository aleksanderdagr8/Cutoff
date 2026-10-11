import type { HealthResponse } from "@cutoff/contracts";

/** Plain function — no ambient globals. */
export function healthHandler(): HealthResponse {
  return {
    ok: true,
    service: "cutoff-api",
    phase: "0",
  };
}
