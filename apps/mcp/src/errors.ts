/**
 * Unit 18 — map API error codes to MCP tool results (isError + next_action).
 * Covers all 13 ApiErrorSchema codes. Unknown codes get a safe fallback.
 */

import type { ErrorCode } from "@cutoff/contracts";

export type ErrorGuidance = {
  retryable: boolean;
  next_action: string;
};

export const API_ERROR_GUIDANCE: Record<ErrorCode, ErrorGuidance> = {
  quote_expired: { retryable: true, next_action: "re-quote" },
  stale_offer: { retryable: true, next_action: "re-quote" },
  quote_mismatch: { retryable: true, next_action: "re-quote" },
  out_of_stock: {
    retryable: true,
    next_action: "try later or ask household to pick another item",
  },
  over_ceiling: {
    retryable: false,
    next_action:
      "ask household to change mandate at callcutoff.com/home/mandate",
  },
  mandate_miss: {
    retryable: false,
    next_action:
      "ask household to change mandate at callcutoff.com/home/mandate",
  },
  revoked: { retryable: false, next_action: "reconnect key" },
  unauthenticated: { retryable: false, next_action: "reconnect key" },
  kill_switch: {
    retryable: true,
    next_action: "try later; do not retry in a loop",
  },
  hold_active: {
    retryable: true,
    next_action: "try later; do not retry in a loop",
  },
  fulfiller_down: {
    retryable: true,
    next_action: "try later; do not retry in a loop",
  },
  duplicate_commit: {
    retryable: false,
    next_action: "already placed; call cutoff_get_receipt",
  },
  not_cancellable: {
    retryable: false,
    next_action: "order cannot be cancelled; call cutoff_get_receipt",
  },
};

export type ToolErrorContent = {
  error: string;
  retryable: boolean;
  next_action: string;
  quote_id?: string;
};

export function mapApiError(
  error: string,
  quoteId?: string,
): ToolErrorContent {
  const guidance = (API_ERROR_GUIDANCE as Record<string, ErrorGuidance>)[
    error
  ] ?? {
    retryable: false,
    next_action: "fix the error; do not invent workarounds",
  };
  return {
    error,
    retryable: guidance.retryable,
    next_action: guidance.next_action,
    ...(quoteId ? { quote_id: quoteId } : {}),
  };
}

export function toolErrorResult(error: string, quoteId?: string) {
  const structured = mapApiError(error, quoteId);
  return {
    content: [
      {
        type: "text" as const,
        text: `${structured.error}: ${structured.next_action}`,
      },
    ],
    structuredContent: structured,
    isError: true as const,
  };
}

export function toolOkResult(
  summary: string,
  structuredContent: Record<string, unknown>,
) {
  return {
    content: [{ type: "text" as const, text: summary }],
    structuredContent: { ...structuredContent, summary },
    isError: false as const,
  };
}
