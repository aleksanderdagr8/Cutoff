import { describe, expect, it } from "vitest";
import { createMcpApp } from "./app.js";
import type { ApiService } from "./bindings.js";
import { MemoryRateLimiter } from "./rate-limit.js";
import { toolsForScopes } from "./tools/catalog.js";

function fakeApi(scopes: string[]): ApiService {
  return {
    async fetch(input: RequestInfo | URL) {
      const url = String(input);
      if (url.includes("/v1/agent/me")) {
        return Response.json({
          key_id: "key_test",
          scopes,
          mandate_ids: ["m_1"],
        });
      }
      return Response.json({ error: "not_found" }, { status: 404 });
    },
  };
}

function testEnv(scopes: string[]) {
  return {
    API: fakeApi(scopes),
    QUOTE_RATE_LIMITER: new MemoryRateLimiter(10_000),
    COMMIT_RATE_LIMITER: new MemoryRateLimiter(10_000),
  };
}

async function mcpRpc(
  scopes: string[],
  body: unknown,
  opts: { authorization?: string } = {},
) {
  const app = createMcpApp();
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (opts.authorization !== undefined) {
    headers.Authorization = opts.authorization;
  } else {
    headers.Authorization = "Bearer ck_live_test";
  }
  return app.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    testEnv(scopes),
  );
}

describe("Phase 11 — Unit 17 MCP scaffold", () => {
  it("toolsForScopes hides commit tools from read_list-only keys", () => {
    const names = toolsForScopes(["read_list"]).map((t) => t.name);
    expect(names).toContain("cutoff_list_items");
    expect(names).toContain("cutoff_due_items");
    expect(names).toContain("cutoff_get_receipt");
    expect(names).toContain("cutoff_skip");
    expect(names).not.toContain("cutoff_commit");
    expect(names).not.toContain("cutoff_cancel_order");
    expect(names).not.toContain("cutoff_quote");
  });

  it("POST /mcp without Bearer returns 401 + WWW-Authenticate", async () => {
    const app = createMcpApp();
    const res = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      }),
      testEnv(["read_list"]),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe("Bearer");
  });

  it("tools/list is filtered by key scopes via GET /v1/agent/me", async () => {
    const readList = await mcpRpc(["read_list"], {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    expect(readList.status).toBe(200);
    const readBody = (await readList.json()) as {
      result: { tools: Array<{ name: string }> };
    };
    const readNames = readBody.result.tools.map((t) => t.name);
    expect(readNames).not.toContain("cutoff_commit");
    expect(readNames).toContain("cutoff_list_items");

    const writeList = await mcpRpc(["quote", "commit", "read_list"], {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });
    const writeBody = (await writeList.json()) as {
      result: { tools: Array<{ name: string }> };
    };
    const writeNames = writeBody.result.tools.map((t) => t.name);
    expect(writeNames).toContain("cutoff_commit");
    expect(writeNames).toContain("cutoff_quote");
  });

  it("initialize returns protocol 2025-06-18", async () => {
    const res = await mcpRpc(["read_list"], {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: { protocolVersion: string; serverInfo: { name: string } };
    };
    expect(body.result.protocolVersion).toBe("2025-06-18");
    expect(body.result.serverInfo.name).toBe("cutoff");
  });

  it("forwards Authorization to the API service binding", async () => {
    let seenAuth: string | null = null;
    const app = createMcpApp();
    const api: ApiService = {
      async fetch(_input, init) {
        seenAuth = new Headers(init?.headers).get("Authorization");
        return Response.json({
          key_id: "k1",
          scopes: ["read_list"],
          mandate_ids: ["m1"],
        });
      },
    };
    await app.fetch(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer ck_live_passthrough",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      }),
      {
        API: api,
        QUOTE_RATE_LIMITER: new MemoryRateLimiter(10_000),
        COMMIT_RATE_LIMITER: new MemoryRateLimiter(10_000),
      },
    );
    expect(seenAuth).toBe("Bearer ck_live_passthrough");
  });
});
