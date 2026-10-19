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
  phase: z.literal("1"),
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

/** Phase 1 stub quote — no catalog; validates mandate + agent auth. */
export const QuoteRequestSchema = z
  .object({
    mandate_id: z.string().min(1),
    canonical_item_id: z.string().min(1),
    qty: z.number().int().positive().max(99),
    deliver_by: z.string().min(1),
    /** Stub amount until catalog/offer exist (Unit 6). */
    amount_cents: CentsSchema,
  })
  .strict();

export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

export const QuoteResponseSchema = z.object({
  quote_id: z.string().min(1),
  expires_at: UtcIsoSchema,
  landed_cents: CentsSchema,
  mandate_id: z.string().min(1),
  canonical_item_id: z.string().min(1),
  ceiling_cents: CentsSchema,
});

export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;

export const CommitRequestSchema = z
  .object({
    quote_id: z.string().min(1),
  })
  .strict();

export type CommitRequest = z.infer<typeof CommitRequestSchema>;

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
