import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it } from "vitest";
import { createApp } from "../../api/src/app.js";
import {
  seedHouseholdWithMandateAndAgent,
  testBindings,
  type TestBindings,
} from "../../api/src/test-helpers.js";
import { createMcpApp } from "./app.js";
import type { ApiService } from "./bindings.js";
import {
  COMMIT_RATE_LIMIT_PER_MINUTE,
  MemoryRateLimiter,
  QUOTE_RATE_LIMIT_PER_MINUTE,
} from "./rate-limit.js";

function apiServiceFromApp(
  apiApp: ReturnType<typeof createApp>,
  bindings: TestBindings,
): ApiService {
  return {
    fetch(input, init) {
      const req =
        input instanceof Request
          ? new Request(input, init)
          : new Request(String(input), init);
      return apiApp.fetch(req, bindings);
    },
  };
}

async function connectMcpClient(opts: {
  bindings: TestBindings;
  secret: string;
  clientName?: string;
  quoteLimit?: number;
  commitLimit?: number;
}) {
  const apiApp = createApp();
  const mcpApp = createMcpApp();
  const api = apiServiceFromApp(apiApp, opts.bindings);
  const mcpEnv = {
    API: api,
    QUOTE_RATE_LIMITER: new MemoryRateLimiter(opts.quoteLimit ?? 10_000),
    COMMIT_RATE_LIMITER: new MemoryRateLimiter(opts.commitLimit ?? 10_000),
  };

  const transport = new StreamableHTTPClientTransport(
    new URL("http://mcp.local/mcp"),
    {
      requestInit: {
        headers: { Authorization: `Bearer ${opts.secret}` },
      },
      fetch: async (input, init) => {
        const url = typeof input === "string" ? input : String(input);
        const path = new URL(url, "http://mcp.local").pathname;
        return mcpApp.fetch(
          new Request(`http://mcp.local${path}`, {
            method: init?.method ?? "GET",
            headers: init?.headers,
            body: init?.body,
          }),
          mcpEnv,
        );
      },
    },
  );

  const client = new Client({
    name: opts.clientName ?? "unit19-test",
    version: "0.0.0",
  });
  await client.connect(transport);
  return { client, transport };
}

function structured(result: {
  structuredContent?: unknown;
  isError?: boolean;
}) {
  return result.structuredContent as Record<string, unknown>;
}

describe("Phase 13 — Unit 19 rate limits + deploy config + mcp evidence", () => {
  it("documents 30 quote / 5 commit per-minute limits", () => {
    expect(QUOTE_RATE_LIMIT_PER_MINUTE).toBe(30);
    expect(COMMIT_RATE_LIMIT_PER_MINUTE).toBe(5);
  });

  it("wrangler.toml wires mcp.callcutoff.com, service binding, and ratelimits", () => {
    const toml = readFileSync(
      join(import.meta.dirname, "../wrangler.toml"),
      "utf8",
    );
    expect(toml).toMatch(/mcp\.callcutoff\.com/);
    expect(toml).toMatch(/custom_domain\s*=\s*true/);
    expect(toml).toMatch(/binding\s*=\s*"API"/);
    expect(toml).toMatch(/service\s*=\s*"cutoff-api"/);
    expect(toml).toMatch(/QUOTE_RATE_LIMITER/);
    expect(toml).toMatch(/COMMIT_RATE_LIMITER/);
    expect(toml).toMatch(/limit\s*=\s*30/);
    expect(toml).toMatch(/limit\s*=\s*5/);
  });

  it("quote rate limit returns tool error with next_action", async () => {
    const bindings = testBindings();
    const { agent, mandate } = await seedHouseholdWithMandateAndAgent(
      bindings,
      { scopes: ["quote", "commit", "read_list"] },
    );

    const { client, transport } = await connectMcpClient({
      bindings,
      secret: agent.secret,
      quoteLimit: 1,
    });

    try {
      const first = await client.callTool({
        name: "cutoff_quote",
        arguments: {
          mandate_id: mandate.mandateId,
          canonical_item_id: "item_towels_12",
          qty: 1,
          deliver_by: "2026-10-25",
        },
      });
      expect(first.isError).toBeFalsy();

      const second = await client.callTool({
        name: "cutoff_quote",
        arguments: {
          mandate_id: mandate.mandateId,
          canonical_item_id: "item_towels_12",
          qty: 1,
          deliver_by: "2026-10-26",
        },
      });
      expect(second.isError).toBe(true);
      const err = structured(second);
      expect(err.error).toBe("rate_limited");
      expect(err.retryable).toBe(true);
      expect(String(err.next_action)).toMatch(/try later/);
    } finally {
      await client.close();
      await transport.close();
    }
  });

  it("commit via MCP records protocol mcp and actor_chain on evidence", async () => {
    const bindings = testBindings();
    const { agent, mandate } = await seedHouseholdWithMandateAndAgent(
      bindings,
      { scopes: ["quote", "commit", "read_list"] },
    );

    const { client, transport } = await connectMcpClient({
      bindings,
      secret: agent.secret,
      clientName: "cursor",
    });

    try {
      const quoteRes = await client.callTool({
        name: "cutoff_quote",
        arguments: {
          mandate_id: mandate.mandateId,
          canonical_item_id: "item_towels_12",
          qty: 1,
          deliver_by: "2026-10-25",
        },
      });
      const quoteId = structured(quoteRes).quote_id as string;

      const commitRes = await client.callTool({
        name: "cutoff_commit",
        arguments: {
          quote_id: quoteId,
          idempotency_key: "idem_unit19_evidence",
        },
      });
      expect(commitRes.isError).toBeFalsy();
      const orderId = structured(commitRes).order_id as string;

      const receipt = await client.callTool({
        name: "cutoff_get_receipt",
        arguments: { order_id: orderId },
      });
      expect(receipt.isError).toBeFalsy();
      const body = structured(receipt);
      expect(body.protocol).toBe("mcp");
      expect(body.actor_chain).toEqual([
        "mcp:cursor",
        `agent:${agent.keyId}`,
      ]);
    } finally {
      await client.close();
      await transport.close();
    }
  });

  it("commit rate limit returns tool error after N commits", async () => {
    const bindings = testBindings();
    const { agent, mandate } = await seedHouseholdWithMandateAndAgent(
      bindings,
      { scopes: ["quote", "commit", "read_list"] },
    );

    const { client, transport } = await connectMcpClient({
      bindings,
      secret: agent.secret,
      commitLimit: 1,
    });

    try {
      const q1 = structured(
        await client.callTool({
          name: "cutoff_quote",
          arguments: {
            mandate_id: mandate.mandateId,
            canonical_item_id: "item_towels_12",
            qty: 1,
            deliver_by: "2026-10-25",
          },
        }),
      );
      const c1 = await client.callTool({
        name: "cutoff_commit",
        arguments: {
          quote_id: q1.quote_id,
          idempotency_key: "idem_rl_1",
        },
      });
      expect(c1.isError).toBeFalsy();

      // Second commit attempt is rate-limited before hitting the API
      // (even with a fresh quote).
      const q2 = structured(
        await client.callTool({
          name: "cutoff_quote",
          arguments: {
            mandate_id: mandate.mandateId,
            canonical_item_id: "item_towels_12",
            qty: 1,
            deliver_by: "2026-10-26",
          },
        }),
      );
      // hold_active may block second quote — either way exercise commit limit
      // with the first quote id if needed.
      const quoteId = (q2.quote_id as string | undefined) ?? (q1.quote_id as string);
      const c2 = await client.callTool({
        name: "cutoff_commit",
        arguments: {
          quote_id: quoteId,
          idempotency_key: "idem_rl_2",
        },
      });
      expect(c2.isError).toBe(true);
      expect(structured(c2).error).toBe("rate_limited");
    } finally {
      await client.close();
      await transport.close();
    }
  });
});
