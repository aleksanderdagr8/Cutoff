/**
 * Unit 17: tool catalog metadata for tools/list.
 * Full tool implementations land in Unit 18 — handlers here are stubs.
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
      "List household reorder lines (cadence, paused, next due). Read-only.",
    requiredScopes: ["read_list"],
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "cutoff_due_items",
    description:
      "List lines due or overdue within within_days (default 7). Read-only.",
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
      "Get a fresh quote for a mandate item or list line. Does not place an order.",
    requiredScopes: ["quote"],
    inputSchema: {
      type: "object",
      properties: {
        mandate_id: { type: "string" },
        canonical_item_id: { type: "string" },
        list_line_id: { type: "string" },
        qty: { type: "integer", minimum: 1, maximum: 99 },
        deliver_by: { type: "string" },
      },
      required: ["qty", "deliver_by"],
      additionalProperties: false,
    },
  },
  {
    name: "cutoff_commit",
    description:
      "Place the order for a quote. Only after user confirmation unless they told you to reorder without asking. Pass the same idempotency_key on retry.",
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
      "Agent-readable order receipt summary (status, why-this-seller, receipt URL).",
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
      "Skip a list line: mode next | snooze | pause (default pause).",
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
    description: "Cancel an order before ship when the mandate allows.",
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
