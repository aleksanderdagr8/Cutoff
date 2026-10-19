/**
 * Unit 18 — seven MCP tool handlers. Thin wrappers over the API service binding.
 */

import { apiFetch, type AgentMe } from "../api-client.js";
import type { ApiService } from "../bindings.js";
import { clientNameForKey } from "../client-info.js";
import { toolErrorResult, toolOkResult } from "../errors.js";
import {
  rateLimitedToolResult,
  type RateLimiter,
} from "../rate-limit.js";
import {
  serializeCancel,
  serializeCommit,
  serializeDueList,
  serializeList,
  serializeQuote,
  serializeReceipt,
  serializeReorderQuote,
  serializeSkip,
} from "./serialize.js";

export type ToolCallContext = {
  api: ApiService;
  authorization: string;
  me: AgentMe;
  quoteRateLimiter: RateLimiter;
  commitRateLimiter: RateLimiter;
};

type Json = Record<string, unknown>;

async function readApiJson(res: Response): Promise<Json> {
  return ((await res.json().catch(() => null)) as Json | null) ?? {};
}

function apiErrorResult(body: Json) {
  const error = typeof body.error === "string" ? body.error : "invalid_body";
  const quoteId =
    typeof body.quote_id === "string" ? body.quote_id : undefined;
  return toolErrorResult(error, quoteId);
}

export async function callTool(
  name: string,
  args: Record<string, unknown> | undefined,
  ctx: ToolCallContext,
) {
  const input = args ?? {};
  switch (name) {
    case "cutoff_list_items":
      return listItems(ctx);
    case "cutoff_due_items":
      return dueItems(ctx, input);
    case "cutoff_quote":
      return quote(ctx, input);
    case "cutoff_commit":
      return commit(ctx, input);
    case "cutoff_get_receipt":
      return getReceipt(ctx, input);
    case "cutoff_skip":
      return skip(ctx, input);
    case "cutoff_cancel_order":
      return cancelOrder(ctx, input);
    default:
      return toolErrorResult("invalid_body");
  }
}

async function listItems(ctx: ToolCallContext) {
  const res = await apiFetch(ctx.api, "/v1/list", {
    method: "GET",
    authorization: ctx.authorization,
  });
  const body = await readApiJson(res);
  if (!res.ok) return apiErrorResult(body);
  const data = serializeList(body);
  return toolOkResult(data.summary, data);
}

async function dueItems(ctx: ToolCallContext, input: Json) {
  const within =
    typeof input.within_days === "number" && Number.isFinite(input.within_days)
      ? Math.max(0, Math.min(365, Math.trunc(input.within_days)))
      : 7;
  const res = await apiFetch(ctx.api, `/v1/list/due?within_days=${within}`, {
    method: "GET",
    authorization: ctx.authorization,
  });
  const body = await readApiJson(res);
  if (!res.ok) return apiErrorResult(body);
  const data = serializeDueList(body);
  return toolOkResult(data.summary, data);
}

async function quote(ctx: ToolCallContext, input: Json) {
  const qty = input.qty;
  const deliverBy = input.deliver_by;
  if (typeof qty !== "number" || typeof deliverBy !== "string") {
    return toolErrorResult("invalid_body");
  }

  const allowed = await ctx.quoteRateLimiter.limit({ key: ctx.me.keyId });
  if (!allowed.success) {
    return rateLimitedToolResult("quote");
  }

  if (typeof input.list_line_id === "string") {
    const payload: Json = {
      list_line_id: input.list_line_id,
      qty,
      deliver_by: deliverBy,
    };
    if (typeof input.nudge_id === "string") {
      payload.nudge_id = input.nudge_id;
    }
    const res = await apiFetch(ctx.api, "/v1/list/reorder", {
      method: "POST",
      authorization: ctx.authorization,
      body: JSON.stringify(payload),
    });
    const body = await readApiJson(res);
    if (!res.ok) return apiErrorResult(body);
    const data = serializeReorderQuote(body);
    return toolOkResult(data.summary, data);
  }

  if (
    typeof input.mandate_id !== "string" ||
    typeof input.canonical_item_id !== "string"
  ) {
    return toolErrorResult("invalid_body");
  }

  const res = await apiFetch(ctx.api, "/v1/quotes", {
    method: "POST",
    authorization: ctx.authorization,
    body: JSON.stringify({
      mandate_id: input.mandate_id,
      canonical_item_id: input.canonical_item_id,
      qty,
      deliver_by: deliverBy,
    }),
  });
  const body = await readApiJson(res);
  if (!res.ok) return apiErrorResult(body);
  const data = serializeQuote(body);
  return toolOkResult(data.summary, data);
}

async function commit(ctx: ToolCallContext, input: Json) {
  const quoteId = input.quote_id;
  const idempotencyKey = input.idempotency_key;
  if (typeof quoteId !== "string" || typeof idempotencyKey !== "string") {
    return toolErrorResult("invalid_body");
  }

  const allowed = await ctx.commitRateLimiter.limit({ key: ctx.me.keyId });
  if (!allowed.success) {
    return rateLimitedToolResult("commit");
  }

  const client = clientNameForKey(ctx.me.keyId);
  const res = await apiFetch(ctx.api, "/v1/commits", {
    method: "POST",
    authorization: ctx.authorization,
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      quote_id: quoteId,
      protocol: "mcp",
      actor_chain: [`mcp:${client}`, `agent:${ctx.me.keyId}`],
    }),
  });
  const body = await readApiJson(res);
  if (!res.ok) return apiErrorResult(body);
  const data = serializeCommit(body);
  return toolOkResult(data.summary, data);
}

async function getReceipt(ctx: ToolCallContext, input: Json) {
  const orderId = input.order_id;
  if (typeof orderId !== "string") {
    return toolErrorResult("invalid_body");
  }

  const orderRes = await apiFetch(ctx.api, `/v1/orders/${orderId}`, {
    method: "GET",
    authorization: ctx.authorization,
  });
  const orderBody = await readApiJson(orderRes);
  if (!orderRes.ok) return apiErrorResult(orderBody);

  const evidenceRes = await apiFetch(
    ctx.api,
    `/v1/orders/${orderId}/evidence`,
    {
      method: "GET",
      authorization: ctx.authorization,
    },
  );
  const evidenceBody = evidenceRes.ok
    ? await readApiJson(evidenceRes)
    : null;

  const data = serializeReceipt(orderBody, evidenceBody);
  return toolOkResult(data.summary, data);
}

async function skip(ctx: ToolCallContext, input: Json) {
  const listLineId = input.list_line_id;
  if (typeof listLineId !== "string") {
    return toolErrorResult("invalid_body");
  }
  const payload: Json = { list_line_id: listLineId };
  if (typeof input.mode === "string") payload.mode = input.mode;
  if (typeof input.until === "string") payload.until = input.until;

  const res = await apiFetch(ctx.api, "/v1/list/skip", {
    method: "POST",
    authorization: ctx.authorization,
    body: JSON.stringify(payload),
  });
  const body = await readApiJson(res);
  if (!res.ok) return apiErrorResult(body);
  const data = serializeSkip(body);
  return toolOkResult(data.summary, data);
}

async function cancelOrder(ctx: ToolCallContext, input: Json) {
  const orderId = input.order_id;
  if (typeof orderId !== "string") {
    return toolErrorResult("invalid_body");
  }
  const res = await apiFetch(ctx.api, "/v1/orders/cancel", {
    method: "POST",
    authorization: ctx.authorization,
    body: JSON.stringify({ order_id: orderId }),
  });
  const body = await readApiJson(res);
  if (!res.ok) return apiErrorResult(body);
  const data = serializeCancel(body);
  return toolOkResult(data.summary, data);
}
