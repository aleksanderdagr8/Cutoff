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
import { API_ERROR_GUIDANCE, mapApiError } from "./errors.js";
import { MemoryRateLimiter } from "./rate-limit.js";
import { ErrorCode } from "@cutoff/contracts";

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
  const auth = `Bearer ${opts.secret}`;
  const mcpEnv = {
    API: api,
    QUOTE_RATE_LIMITER: new MemoryRateLimiter(opts.quoteLimit ?? 10_000),
    COMMIT_RATE_LIMITER: new MemoryRateLimiter(opts.commitLimit ?? 10_000),
  };

  const transport = new StreamableHTTPClientTransport(
    new URL("http://mcp.local/mcp"),
    {
      requestInit: {
        headers: { Authorization: auth },
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
    name: opts.clientName ?? "unit18-test",
    version: "0.0.0",
  });
  await client.connect(transport);
  return { client, transport, apiApp, api };
}

function structured(result: {
  structuredContent?: unknown;
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}) {
  return result.structuredContent as Record<string, unknown>;
}

describe("Phase 12 — Unit 18 MCP tools", () => {
  it("error map covers all 13 ApiError codes", () => {
    const codes = Object.values(ErrorCode);
    expect(codes).toHaveLength(13);
    for (const code of codes) {
      expect(API_ERROR_GUIDANCE[code]).toBeDefined();
      expect(mapApiError(code).next_action.length).toBeGreaterThan(0);
    }
    expect(mapApiError("quote_expired").retryable).toBe(true);
    expect(mapApiError("quote_expired").next_action).toBe("re-quote");
    expect(mapApiError("over_ceiling").retryable).toBe(false);
    expect(mapApiError("duplicate_commit").next_action).toMatch(
      /cutoff_get_receipt/,
    );
  });

  it("SDK client lists annotated tools and runs quote → commit → receipt", async () => {
    const bindings = testBindings();
    const { agent, mandate } = await seedHouseholdWithMandateAndAgent(
      bindings,
      { scopes: ["quote", "commit", "read_list"], allowCancel: true },
    );

    const { client, transport } = await connectMcpClient({
      bindings,
      secret: agent.secret,
      clientName: "claude",
    });

    try {
      const listed = await client.listTools();
      const byName = Object.fromEntries(
        listed.tools.map((t) => [t.name, t]),
      );
      expect(byName.cutoff_list_items?.annotations?.readOnlyHint).toBe(true);
      expect(byName.cutoff_due_items?.annotations?.readOnlyHint).toBe(true);
      expect(byName.cutoff_get_receipt?.annotations?.readOnlyHint).toBe(true);
      expect(byName.cutoff_commit?.annotations?.destructiveHint).toBe(true);
      expect(byName.cutoff_commit?.annotations?.idempotentHint).toBe(true);
      expect(byName.cutoff_cancel_order?.annotations?.destructiveHint).toBe(
        true,
      );

      const quoteRes = await client.callTool({
        name: "cutoff_quote",
        arguments: {
          mandate_id: mandate.mandateId,
          canonical_item_id: "item_towels_12",
          qty: 1,
          deliver_by: "2026-10-25",
        },
      });
      expect(quoteRes.isError).toBeFalsy();
      const quote = structured(quoteRes);
      expect(typeof quote.quote_id).toBe("string");
      expect(typeof quote.landed_cents).toBe("number");
      expect(String(quote.summary)).toMatch(/Quote/);

      const idem = "idem_unit18_1";
      const commitRes = await client.callTool({
        name: "cutoff_commit",
        arguments: {
          quote_id: quote.quote_id,
          idempotency_key: idem,
        },
      });
      expect(commitRes.isError).toBeFalsy();
      const commit = structured(commitRes);
      expect(commit.order_id).toBeTruthy();
      expect(commit.evidence_id).toBeTruthy();
      expect(commit.household_id).toBeUndefined();

      const receiptRes = await client.callTool({
        name: "cutoff_get_receipt",
        arguments: { order_id: commit.order_id },
      });
      expect(receiptRes.isError).toBeFalsy();
      const receipt = structured(receiptRes);
      expect(receipt.order_id).toBe(commit.order_id);
      expect(receipt.summary).toBeTruthy();
      expect(receipt.actor_chain).toEqual([
        "mcp:claude",
        `agent:${agent.keyId}`,
      ]);
      expect(receipt.protocol).toBe("mcp");
      expect(receipt.address_id).toBeUndefined();

      // Replay commit is idempotent.
      const replay = await client.callTool({
        name: "cutoff_commit",
        arguments: {
          quote_id: quote.quote_id,
          idempotency_key: idem,
        },
      });
      expect(replay.isError).toBeFalsy();
      expect(structured(replay).order_id).toBe(commit.order_id);
      expect(structured(replay).created).toBe(false);
    } finally {
      await client.close();
      await transport.close();
    }
  });

  it("list / due / skip / cancel tools against createApp fakes", async () => {
    const bindings = testBindings({
      nowUtc: () => "2026-10-19T12:00:00.000Z",
    });
    const { household, mandate, agent } =
      await seedHouseholdWithMandateAndAgent(bindings, {
        scopes: ["quote", "commit", "read_list"],
        allowCancel: true,
      });

    const line = await bindings.list.upsert({
      householdId: household.householdId,
      mandateId: mandate.mandateId,
      canonicalItemId: "item_towels_12",
      cadenceHintDays: 30,
      nowUtc: "2026-09-01T12:00:00.000Z",
    });
    await bindings.list.recordOrder(
      line.lineId,
      "ord_seed",
      "2026-09-21T12:00:00.000Z",
    );

    const { client, transport } = await connectMcpClient({
      bindings,
      secret: agent.secret,
    });

    try {
      const listRes = await client.callTool({
        name: "cutoff_list_items",
        arguments: {},
      });
      expect(listRes.isError).toBeFalsy();
      const list = structured(listRes);
      expect(Array.isArray(list.lines)).toBe(true);
      expect((list.lines as unknown[]).length).toBe(1);

      const dueRes = await client.callTool({
        name: "cutoff_due_items",
        arguments: { within_days: 60 },
      });
      expect(dueRes.isError).toBeFalsy();
      const due = structured(dueRes);
      expect((due.lines as unknown[]).length).toBeGreaterThan(0);

      const skipRes = await client.callTool({
        name: "cutoff_skip",
        arguments: { list_line_id: line.lineId, mode: "pause" },
      });
      expect(skipRes.isError).toBeFalsy();
      expect(structured(skipRes).paused).toBe(true);

      const quoteRes = await client.callTool({
        name: "cutoff_quote",
        arguments: {
          mandate_id: mandate.mandateId,
          canonical_item_id: "item_towels_12",
          qty: 1,
          deliver_by: "2026-10-25",
        },
      });
      expect(quoteRes.isError).toBeFalsy();
      const q = structured(quoteRes);
      const commitRes = await client.callTool({
        name: "cutoff_commit",
        arguments: {
          quote_id: q.quote_id,
          idempotency_key: "idem_unit18_cancel",
        },
      });
      expect(commitRes.isError).toBeFalsy();
      const orderId = structured(commitRes).order_id as string;

      const cancelRes = await client.callTool({
        name: "cutoff_cancel_order",
        arguments: { order_id: orderId },
      });
      // Fake fulfill may place immediately; cancel before ship depends on status.
      if (cancelRes.isError) {
        const err = structured(cancelRes);
        expect(err.error).toBe("not_cancellable");
        expect(err.next_action).toMatch(/cutoff_get_receipt/);
      } else {
        expect(structured(cancelRes).status).toBe("cancelled");
      }
    } finally {
      await client.close();
      await transport.close();
    }
  });

  it("API errors become tool results with next_action (not JSON-RPC errors)", async () => {
    const bindings = testBindings();
    const { agent, mandate } = await seedHouseholdWithMandateAndAgent(
      bindings,
      { scopes: ["quote", "commit", "read_list"] },
    );
    const { client, transport } = await connectMcpClient({
      bindings,
      secret: agent.secret,
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

      // Expire quote then commit → quote_expired tool error.
      bindings.nowUtc = () => "2026-12-01T00:00:00.000Z";
      const expired = await client.callTool({
        name: "cutoff_commit",
        arguments: {
          quote_id: quoteId,
          idempotency_key: "idem_expired",
        },
      });
      expect(expired.isError).toBe(true);
      const err = structured(expired);
      expect(err.error).toBe("quote_expired");
      expect(err.retryable).toBe(true);
      expect(err.next_action).toBe("re-quote");
    } finally {
      await client.close();
      await transport.close();
    }
  });

  it("read_list-only key cannot call cutoff_commit (JSON-RPC method not found)", async () => {
    const bindings = testBindings();
    const { agent } = await seedHouseholdWithMandateAndAgent(bindings, {
      scopes: ["read_list"],
    });
    const { client, transport } = await connectMcpClient({
      bindings,
      secret: agent.secret,
    });

    try {
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name)).not.toContain("cutoff_commit");

      await expect(
        client.callTool({
          name: "cutoff_commit",
          arguments: { quote_id: "q", idempotency_key: "k" },
        }),
      ).rejects.toThrow();
    } finally {
      await client.close();
      await transport.close();
    }
  });
});
