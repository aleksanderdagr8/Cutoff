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
  phase: z.literal("0"),
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
