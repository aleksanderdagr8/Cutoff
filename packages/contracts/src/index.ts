import { z } from "zod";

/** Stable agent API error codes (Unit 0+). */
export const ErrorCode = {
  unauthenticated: "unauthenticated",
  revoked: "revoked",
  mandate_miss: "mandate_miss",
  over_ceiling: "over_ceiling",
  hold_active: "hold_active",
  stale_offer: "stale_offer",
  out_of_stock: "out_of_stock",
  quote_expired: "quote_expired",
  quote_mismatch: "quote_mismatch",
  duplicate_commit: "duplicate_commit",
  kill_switch: "kill_switch",
  fulfiller_down: "fulfiller_down",
  not_cancellable: "not_cancellable",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ApiErrorSchema = z.object({
  error: z.enum([
    "unauthenticated",
    "revoked",
    "mandate_miss",
    "over_ceiling",
    "hold_active",
    "stale_offer",
    "out_of_stock",
    "quote_expired",
    "quote_mismatch",
    "duplicate_commit",
    "kill_switch",
    "fulfiller_down",
    "not_cancellable",
  ]),
  quote_id: z.string().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

/** Money is integer cents. */
export const CentsSchema = z.number().int().nonnegative();

/** UTC ISO-8601 timestamp string. */
export const UtcIsoSchema = z.string().datetime({ offset: true });

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("cutoff-api"),
  phase: z.literal("5"),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/** Phase 0 fake commit request (no live quote yet). */
export const FakeCommitRequestSchema = z
  .object({
    household_id: z.string().min(1),
    canonical_item_id: z.string().min(1),
    quote_id: z.string().min(1),
    amount_cents: CentsSchema,
  })
  .strict();

export type FakeCommitRequest = z.infer<typeof FakeCommitRequestSchema>;

export const FakeCommitResponseSchema = z.object({
  order_id: z.string().min(1),
  household_id: z.string().min(1),
  amount_cents: CentsSchema,
  created: z.boolean(),
});

export type FakeCommitResponse = z.infer<typeof FakeCommitResponseSchema>;

export const AgentScopeSchema = z.enum(["quote", "commit", "read_list"]);

export const CreateHouseholdRequestSchema = z
  .object({
    name: z.string().min(1).max(120),
    member_email: z.string().email(),
  })
  .strict();

export type CreateHouseholdRequest = z.infer<
  typeof CreateHouseholdRequestSchema
>;

export const CreateMandateRequestSchema = z
  .object({
    ceiling_cents: CentsSchema,
    expires_at: UtcIsoSchema,
    canonical_item_ids: z.array(z.string().min(1)).default([]),
    category_allow_list: z.array(z.string().min(1)).default([]),
    never_substitute_ids: z.array(z.string().min(1)).default([]),
    address_id: z.string().min(1),
    actor_cap: z.number().int().positive().max(32).default(4),
    /** Agent may cancel-before-ship (Unit 9). Default false. */
    allow_cancel: z.boolean().default(false),
  })
  .strict();

export type CreateMandateRequest = z.infer<typeof CreateMandateRequestSchema>;

export const LowerCeilingRequestSchema = z
  .object({
    ceiling_cents: CentsSchema,
  })
  .strict();

export type LowerCeilingRequest = z.infer<typeof LowerCeilingRequestSchema>;

export const IssueAgentRequestSchema = z
  .object({
    scopes: z.array(AgentScopeSchema).min(1),
    mandate_ids: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type IssueAgentRequest = z.infer<typeof IssueAgentRequestSchema>;

/** Phase 2 quote — catalog + offers select the winner; no client amount. */
export const QuoteRequestSchema = z
  .object({
    mandate_id: z.string().min(1),
    canonical_item_id: z.string().min(1),
    qty: z.number().int().positive().max(99),
    deliver_by: z.string().min(1),
  })
  .strict();

export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

export const QuoteSubstituteSchema = z.object({
  from_canonical_item_id: z.string().min(1),
  to_canonical_item_id: z.string().min(1),
  pack_count_delta: z.number().int(),
  brand_from: z.string(),
  brand_to: z.string(),
  price_delta_cents: z.number().int(),
  day_delta: z.number().int(),
  formula_flag: z.string().nullable(),
});

export const QuoteResponseSchema = z.object({
  quote_id: z.string().min(1),
  expires_at: UtcIsoSchema,
  landed_cents: CentsSchema,
  tax_cents: CentsSchema,
  unit_price_cents: CentsSchema,
  delivery_date: z.string().min(1),
  fulfiller_id: z.string().min(1),
  mandate_id: z.string().min(1),
  canonical_item_id: z.string().min(1),
  ceiling_cents: CentsSchema,
  score_inputs: z.object({
    landed_cents: CentsSchema,
    delivery_date: z.string().min(1),
    merchant_score: z.number(),
  }),
  substitute: QuoteSubstituteSchema.nullable(),
});

export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;

export const CommitRequestSchema = z
  .object({
    quote_id: z.string().min(1),
    /** Actor chain for evidence — required on commit (Unit 8). */
    actor_chain: z.array(z.string().min(1)).min(1),
    /** Protocol name recorded on the evidence row. */
    protocol: z.string().min(1).max(64),
  })
  .strict();

export type CommitRequest = z.infer<typeof CommitRequestSchema>;

export const CommitResponseSchema = z.object({
  order_id: z.string().min(1),
  household_id: z.string().min(1),
  amount_cents: CentsSchema,
  created: z.boolean(),
  status: z.enum([
    "committed",
    "captured",
    "failed",
    "placed",
    "shipped",
    "delivered",
    "refunded",
  ]),
  evidence_id: z.string().min(1).optional(),
  job_id: z.string().min(1).optional(),
  refund_id: z.string().min(1).optional(),
  /** Unit 10: charge-descriptor receipt link token. */
  receipt_token: z.string().min(1).optional(),
});

export type CommitResponse = z.infer<typeof CommitResponseSchema>;

export const CancelOrderRequestSchema = z
  .object({
    order_id: z.string().min(1),
  })
  .strict();

export type CancelOrderRequest = z.infer<typeof CancelOrderRequestSchema>;

export const CancelOrderResponseSchema = z.object({
  order_id: z.string().min(1),
  status: z.literal("cancelled"),
});

export type CancelOrderResponse = z.infer<typeof CancelOrderResponseSchema>;

export const OrderTrackingResponseSchema = z.object({
  order_id: z.string().min(1),
  status: z.enum([
    "committed",
    "captured",
    "failed",
    "placed",
    "shipped",
    "delivered",
    "refunded",
  ]),
  job_id: z.string().nullable(),
  tracking_number: z.string().nullable(),
  shipment_events: z.array(
    z.object({
      event_id: z.string().min(1),
      status: z.string().min(1),
      tracking_number: z.string().nullable(),
      at: UtcIsoSchema,
    }),
  ),
});

export type OrderTrackingResponse = z.infer<typeof OrderTrackingResponseSchema>;

export const InboundFulfillWebhookSchema = z
  .object({
    event_id: z.string().min(1),
    order_id: z.string().min(1),
    job_id: z.string().min(1),
    status: z.enum(["shipped", "delivered", "cancelled", "tracking_update"]),
    tracking_number: z.string().min(1).nullable(),
    occurred_at: UtcIsoSchema,
  })
  .strict();

export type InboundFulfillWebhook = z.infer<typeof InboundFulfillWebhookSchema>;

/** Agent widen attempts — always rejected. */
export const AgentWidenMandateRequestSchema = z
  .object({
    raise_ceiling: z.boolean().optional(),
    ceiling_cents: CentsSchema.optional(),
    add_address: z.boolean().optional(),
    address_id: z.string().min(1).optional(),
  })
  .strict();

export type AgentWidenMandateRequest = z.infer<
  typeof AgentWidenMandateRequestSchema
>;

/** Unit 10 — household receipt (human session). */
export const ReceiptResponseSchema = z.object({
  receipt_token: z.string().min(1),
  order_id: z.string().min(1),
  household_id: z.string().min(1),
  item: z.object({
    canonical_item_id: z.string().min(1),
    description: z.string(),
    brand: z.string(),
  }),
  landed_cents: CentsSchema,
  fulfiller_id: z.string().min(1),
  why_this_seller: z.object({
    landed_cents: CentsSchema,
    delivery_date: z.string().min(1),
    merchant_score: z.number(),
  }),
  status: z.enum([
    "committed",
    "captured",
    "failed",
    "placed",
    "shipped",
    "delivered",
    "refunded",
  ]),
  /** Skip is one call — no retention interstitial. */
  skip_available: z.boolean(),
});

export type ReceiptResponse = z.infer<typeof ReceiptResponseSchema>;

export const ReceiptSkipResponseSchema = z.object({
  order_id: z.string().min(1),
  action: z.enum(["cancel", "return_request"]),
  status: z.string().min(1),
  return_id: z.string().min(1).optional(),
});

export type ReceiptSkipResponse = z.infer<typeof ReceiptSkipResponseSchema>;

/** Unit 11 — household list line. */
export const ListLineSchema = z.object({
  line_id: z.string().min(1),
  canonical_item_id: z.string().min(1),
  cadence_hint_days: z.number().int().positive().nullable(),
  never_substitute: z.boolean(),
  last_quote_id: z.string().min(1).nullable(),
  last_order_id: z.string().min(1).nullable(),
  paused: z.boolean(),
  mandate_id: z.string().min(1),
});

export type ListLine = z.infer<typeof ListLineSchema>;

export const ListResponseSchema = z.object({
  household_id: z.string().min(1),
  lines: z.array(ListLineSchema),
});

export type ListResponse = z.infer<typeof ListResponseSchema>;

export const UpsertListLineRequestSchema = z
  .object({
    mandate_id: z.string().min(1),
    canonical_item_id: z.string().min(1),
    cadence_hint_days: z.number().int().positive().nullable().optional(),
    never_substitute: z.boolean().optional(),
  })
  .strict();

export type UpsertListLineRequest = z.infer<typeof UpsertListLineRequestSchema>;

/**
 * Reorder: fresh quote path. No sticky fulfiller. No sensor/image/weight.
 * `.strict()` rejects unknown keys including depletion signals.
 */
export const ReorderRequestSchema = z
  .object({
    list_line_id: z.string().min(1),
    qty: z.number().int().positive().max(99),
    deliver_by: z.string().min(1),
  })
  .strict();

export type ReorderRequest = z.infer<typeof ReorderRequestSchema>;

export const ReorderResponseSchema = z.object({
  list_line_id: z.string().min(1),
  quote_id: z.string().min(1),
  fulfiller_id: z.string().min(1),
  landed_cents: CentsSchema,
  expires_at: UtcIsoSchema,
});

export type ReorderResponse = z.infer<typeof ReorderResponseSchema>;

export const SkipListLineRequestSchema = z
  .object({
    list_line_id: z.string().min(1),
  })
  .strict();

export type SkipListLineRequest = z.infer<typeof SkipListLineRequestSchema>;

export const SkipListLineResponseSchema = z.object({
  line_id: z.string().min(1),
  paused: z.literal(true),
});

export type SkipListLineResponse = z.infer<typeof SkipListLineResponseSchema>;
