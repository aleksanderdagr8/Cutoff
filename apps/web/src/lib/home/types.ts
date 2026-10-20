/** Shared household `/home` view types (safe for client imports). */

/** Cookie / Auth session payload for household `/home` (no secrets). */
export type HomeSession = {
  memberId: string;
  householdId: string;
  email: string;
  householdName: string;
};

export type HomeListLineView = {
  line_id: string;
  canonical_item_id: string;
  brand: string;
  description: string;
  cadence_hint_days: number | null;
  /** Unit 22: fixed | learned (display only; P1 fixed). */
  cadence_source: "fixed" | "learned";
  /** Unit 22: next due for household list. */
  next_due_at: string | null;
  snoozed_until: string | null;
  never_substitute: boolean;
  last_quote_id: string | null;
  last_order_id: string | null;
  last_price_cents: number | null;
  paused: boolean;
  mandate_id: string;
  receipt_token: string | null;
};

/** Unit 22: household nudge / agent webhook settings. */
export type HomeNudgeSettingsView = {
  agent_webhook_url: string | null;
  email_enabled: boolean;
  auto_commit_enabled: false;
};

export type HomeMandateView = {
  mandate_id: string;
  ceiling_cents: number;
  expires_at: string;
  address_id: string;
  never_substitute_ids: string[];
  canonical_item_ids: string[];
  allow_cancel: boolean;
};

/** Precise household shipping address bound to mandate.address_id. */
export type HomeAddressView = {
  address_id: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postal: string;
  country: string;
  formatted: string;
  place_id: string | null;
};

export type HomeKeyView = {
  key_id: string;
  scopes: string[];
  mandate_ids: string[];
  revoked: boolean;
  created_at: string;
  last_used_at: string | null;
};

export type HomeOrderView = {
  order_id: string;
  receipt_token: string | null;
  brand: string;
  description: string;
  landed_cents: number;
  status: string;
  created_at: string;
};
