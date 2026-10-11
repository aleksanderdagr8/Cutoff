/**
 * Module → table ownership (framework §2).
 * Other packages must not import this file or read these tables directly.
 * Repositories in this package are the only access path.
 */

export const MODULE_TABLES = {
  principal: ["principals", "households", "members"],
  agent_credential: ["agent_credentials", "revocations"],
  mandate: ["mandates", "mandate_lines"],
  catalog: ["canonical_items", "equivalences"],
  offer: ["offers"],
  quote: ["quotes"],
  commit: ["orders"],
  ledger: ["order_events", "evidence"],
  pay: ["charges", "refunds"],
  fulfill: ["fulfillment_jobs", "shipment_events"],
  risk: ["merchant_scores"],
  /** Unique commit lock: (household_id, idempotency_key) */
  edge: ["idempotency_keys"],
} as const;

export type ModuleName = keyof typeof MODULE_TABLES;
