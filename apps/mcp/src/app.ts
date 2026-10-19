/**
 * Cutoff MCP Worker app (Unit 17 scaffold).
 * Streamable HTTP at /mcp. Bearer passthrough → API service binding.
 */

import { Hono } from "hono";
import type { McpBindings } from "./bindings.js";
import { fetchAgentMe } from "./api-client.js";
import { handleMcpJsonRpc } from "./mcp-rpc.js";

export type McpAppEnv = {
  Bindings: McpBindings;
};

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthenticated" }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "WWW-Authenticate": "Bearer",
    },
  });
}

export function createMcpApp() {
  const app = new Hono<McpAppEnv>();

  app.get("/health", (c) =>
    c.json({ ok: true as const, service: "cutoff-mcp", phase: "11" }),
  );

  /** Stateless Streamable HTTP: GET not used (no SSE session). */
  app.get("/mcp", (c) => c.text("Method Not Allowed", 405));

  app.post("/mcp", async (c) => {
    const authorization = c.req.header("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return unauthorized();
    }

    const me = await fetchAgentMe(c.env.API, authorization);
    if (!me.ok) {
      return unauthorized();
    }

    const body = await c.req.json().catch(() => null);
    const rpc = await handleMcpJsonRpc(body, me.me.scopes);
    if (rpc === null) {
      return new Response(null, { status: 202 });
    }
    return c.json(rpc);
  });

  return app;
}
