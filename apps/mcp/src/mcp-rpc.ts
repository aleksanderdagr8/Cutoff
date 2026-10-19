/**
 * Streamable HTTP MCP JSON-RPC (stateless, JSON responses).
 * Unit 18: initialize + tools/list + tools/call (seven tools).
 */

import type { AgentMe } from "./api-client.js";
import type { ApiService } from "./bindings.js";
import { rememberClientName } from "./client-info.js";
import { callTool } from "./tools/call.js";
import { toolsForScopes, type McpToolDef } from "./tools/catalog.js";

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
};

export type McpRpcContext = {
  api: ApiService;
  authorization: string;
  me: AgentMe;
};

function ok(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function err(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
}

function toolListEntry(t: McpToolDef) {
  return {
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    ...(t.annotations ? { annotations: t.annotations } : {}),
  };
}

export async function handleMcpJsonRpc(
  body: unknown,
  ctx: McpRpcContext,
): Promise<unknown> {
  const req = (body ?? {}) as JsonRpcRequest;
  if (req.jsonrpc !== "2.0" || typeof req.method !== "string") {
    return err(req.id ?? null, -32600, "Invalid Request");
  }

  const id = req.id ?? null;
  const scopes = ctx.me.scopes;

  switch (req.method) {
    case "initialize": {
      const params = (req.params ?? {}) as {
        clientInfo?: { name?: string };
      };
      rememberClientName(ctx.me.keyId, params.clientInfo?.name);
      return ok(id, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "cutoff", version: "0.1.0" },
      });
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return ok(id, {});
    case "tools/list": {
      const tools = toolsForScopes(scopes).map(toolListEntry);
      return ok(id, { tools });
    }
    case "tools/call": {
      const params = (req.params ?? {}) as {
        name?: string;
        arguments?: Record<string, unknown>;
      };
      const name = params.name;
      const allowed = toolsForScopes(scopes);
      if (!name || !allowed.some((t) => t.name === name)) {
        return err(id, -32601, "Method not found", { tool: name });
      }
      const result = await callTool(name, params.arguments, {
        api: ctx.api,
        authorization: ctx.authorization,
        me: ctx.me,
      });
      return ok(id, result);
    }
    default:
      return err(id, -32601, `Method not found: ${req.method}`);
  }
}
