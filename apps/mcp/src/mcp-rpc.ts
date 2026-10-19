/**
 * Minimal Streamable HTTP MCP JSON-RPC (stateless, JSON responses).
 * Unit 17: initialize + tools/list (+ stub tools/call). Unit 18 fills tools.
 */

import type { AgentScope } from "@cutoff/domain";
import { toolsForScopes, type McpToolDef } from "./tools/catalog.js";

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
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
  scopes: readonly AgentScope[],
): Promise<unknown> {
  const req = (body ?? {}) as JsonRpcRequest;
  if (req.jsonrpc !== "2.0" || typeof req.method !== "string") {
    return err(req.id ?? null, -32600, "Invalid Request");
  }

  const id = req.id ?? null;

  switch (req.method) {
    case "initialize":
      return ok(id, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "cutoff", version: "0.1.0" },
      });
    case "notifications/initialized":
    case "notifications/cancelled":
      // Notifications have no response body in streamable HTTP JSON mode.
      return null;
    case "ping":
      return ok(id, {});
    case "tools/list": {
      const tools = toolsForScopes(scopes).map(toolListEntry);
      return ok(id, { tools });
    }
    case "tools/call": {
      const params = (req.params ?? {}) as { name?: string };
      const name = params.name;
      const allowed = toolsForScopes(scopes);
      if (!name || !allowed.some((t) => t.name === name)) {
        return err(id, -32601, "Method not found", { tool: name });
      }
      // Unit 17 stub — Unit 18 wires real API calls.
      return ok(id, {
        content: [
          {
            type: "text",
            text: `Tool ${name} is registered; implementation lands in Unit 18.`,
          },
        ],
        isError: false,
      });
    }
    default:
      return err(id, -32601, `Method not found: ${req.method}`);
  }
}
