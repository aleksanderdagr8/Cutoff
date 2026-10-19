/**
 * Tool catalog metadata for tools/list (LLM-facing descriptions + annotations).
 */

import type { AgentScope } from "@cutoff/domain";

export type McpToolDef = {
  name: string;
  description: string;
  /** All listed scopes required (AND). */
  requiredScopes?: readonly AgentScope[];
  /** At least one listed scope required (OR). */
  anyOfScopes?: readonly AgentScope[];
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
  };
};

export const MCP_TOOL_CATALOG: readonly McpToolDef[] = [
  {
    name: "cutoff_list_items",
    description:
      "List household reorder lines (cadence, paused, next due, never-substitute). Read-only. Does not place orders.",
    requiredScopes: ["read_list"],
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "cutoff_due_items",
    description:
      "List lines due or overdue within within_days (default 7). Read-only. Use before quoting a reorder.",
    requiredScopes: ["read_list"],
    inputSchema: {
      type: "object",
      properties: {
        within_days: { type: "integer", minimum: 0, maximum: 365 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "cutoff_quote",
    description:
      "Get a fresh quote. Pass mandate_id + canonical_item_id + qty + deliver_by, or list_line_id + qty + deliver_by for a list reorder. Does not place an order. Never invent a quote_id — only use one returned here.",
    requiredScopes: ["quote"],
    inputSchema: {
      type: "object",
      properties: {
        mandate_id: { type: "string" },
        canonical_item_id: { type: "string" },
        list_line_id: { type: "string" },
        qty: { type: "integer", minimum: 1, maximum: 99 },
        deliver_by: { type: "string" },
        nudge_id: { type: "string" },
      },
      required: ["qty", "deliver_by"],
      additionalProperties: false,
    },
  },
  {
    name: "cutoff_commit",
    description:
      "Place the order for a quote returned by cutoff_quote. Only call this after the user has confirmed the item, quantity, and landed_cents total, unless they have told you to reorder this item without asking. Pass the same idempotency_key if you retry. Never invent a quote_id. If you get quote_expired or stale_offer, call cutoff_quote again. You cannot raise the spending ceiling: over_ceiling means tell the household.",
    requiredScopes: ["commit"],
    inputSchema: {
      type: "object",
      properties: {
        quote_id: { type: "string" },
        idempotency_key: { type: "string" },
      },
      required: ["quote_id", "idempotency_key"],
      additionalProperties: false,
    },
    annotations: { destructiveHint: true, idempotentHint: true },
  },
  {
    name: "cutoff_get_receipt",
    description:
      "Agent-readable order receipt: status, shipment events, why-this-seller, receipt URL. Read-only.",
    anyOfScopes: ["read_list", "commit"],
    inputSchema: {
      type: "object",
      properties: { order_id: { type: "string" } },
      required: ["order_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "cutoff_skip",
    description:
      "Skip a list line: mode next (advance one cycle), snooze (until required), or pause (default). Does not place an order.",
    requiredScopes: ["read_list"],
    inputSchema: {
      type: "object",
      properties: {
        list_line_id: { type: "string" },
        mode: { type: "string", enum: ["next", "snooze", "pause"] },
        until: { type: "string" },
      },
      required: ["list_line_id"],
      additionalProperties: false,
    },
  },
  {
    name: "cutoff_cancel_order",
    description:
      "Cancel an order before ship when the mandate allows. If not_cancellable, call cutoff_get_receipt instead.",
    requiredScopes: ["commit"],
    inputSchema: {
      type: "object",
      properties: { order_id: { type: "string" } },
      required: ["order_id"],
      additionalProperties: false,
    },
    annotations: { destructiveHint: true },
  },
];

export function toolsForScopes(scopes: readonly AgentScope[]): McpToolDef[] {
  const set = new Set(scopes);
  return MCP_TOOL_CATALOG.filter((t) => {
    if (t.anyOfScopes?.length && !t.anyOfScopes.some((s) => set.has(s))) {
      return false;
    }
    if (t.requiredScopes?.length && !t.requiredScopes.every((s) => set.has(s))) {
      return false;
    }
    return true;
  });
}
