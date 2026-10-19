export type OpsAlertSeverity = "info" | "warn" | "critical";

export type OpsAlertView = {
  alert_id: string;
  severity: OpsAlertSeverity;
  title: string;
  detail: string;
  href: string | null;
};

export type OpsFlowRowView = {
  order_id: string;
  at_utc: string;
  household_id: string;
  household_name: string;
  item_description: string;
  landed_cents: number;
  fulfiller_id: string;
  agent_key_id: string;
  last_event: string;
};

export type OpsNeverCommittedView = {
  quote_id: string;
  household_id: string;
  household_name: string;
  item_description: string;
  landed_cents: number;
  fulfiller_id: string;
  created_at: string;
  expires_at: string;
  expired: boolean;
};

export type OpsLiveView = {
  rows: OpsFlowRowView[];
  never_committed: OpsNeverCommittedView[];
  alerts: OpsAlertView[];
  kill_switch: boolean;
};

export type OpsOrderAction =
  | "kill_switch_on"
  | "kill_switch_off"
  | "revoke_key"
  | "refund"
  | "cancel_before_ship"
  | "release_hold"
  | "pause_line"
  | "replay_webhook"
  | "lower_ceiling"
  | "suspend_fulfiller"
  | "resume_fulfiller";

export type OpsAuditView = {
  audit_id: string;
  at_utc: string;
  actor_id: string;
  action: string;
  target_id: string | null;
  reason: string;
  order_id: string | null;
};

export type OpsEvidenceView = {
  evidence_id: string;
  actor_chain: string[];
  protocol: string;
  agent_key_id: string;
  mandate_id: string;
  quote_hash: string;
  address_id: string;
  amount_cents: number;
};

export type OpsRankInputsView = {
  landed_cents: number;
  delivery_date_utc: string;
  merchant_score: number;
};

export type OpsOrderSheetView = {
  order_id: string;
  household_id: string;
  household_name: string;
  canonical_item_id: string;
  item_description: string;
  brand: string;
  status: string;
  landed_cents: number;
  fulfiller_id: string;
  quote_id: string;
  agent_key_id: string;
  mandate_id: string;
  events: Array<{ event_id: string; status: string; at_utc: string }>;
  evidence: OpsEvidenceView | null;
  rank_inputs: OpsRankInputsView | null;
  open_hold_quote_id: string | null;
  list_line_id: string | null;
  line_paused: boolean;
  available_actions: OpsOrderAction[];
};

export type OpsHouseholdView = {
  household_id: string;
  name: string;
  member_emails: string[];
  created_at: string;
  order_count: number;
};

export type OpsMandateView = {
  mandate_id: string;
  household_id: string;
  household_name: string;
  ceiling_cents: number;
  expires_at: string;
  address_id: string;
  never_substitute_ids: string[];
};

export type OpsFulfillerView = {
  fulfiller_id: string;
  score: number;
  strikes: number;
  suspended: boolean;
  updated_at: string | null;
};
