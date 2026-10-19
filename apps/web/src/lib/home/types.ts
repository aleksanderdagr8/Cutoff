/** Shared household `/home` view types (safe for client imports). */

export type HomeListLineView = {
  line_id: string;
  canonical_item_id: string;
  brand: string;
  description: string;
  cadence_hint_days: number | null;
  never_substitute: boolean;
  last_quote_id: string | null;
  last_order_id: string | null;
  last_price_cents: number | null;
  paused: boolean;
  mandate_id: string;
  receipt_token: string | null;
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

export type HomeKeyView = {
  key_id: string;
  scopes: string[];
  mandate_ids: string[];
  revoked: boolean;
  created_at: string;
  last_used_at: string | null;
};
