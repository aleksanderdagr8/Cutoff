import { describe, expect, it } from "vitest";
import { AgentMeResponseSchema } from "@cutoff/contracts";
import { createApp } from "./app.js";
import {
  seedHouseholdWithMandateAndAgent,
  testBindings,
} from "./test-helpers.js";

describe("Phase 11 — Unit 17 agent me (MCP introspect)", () => {
  it("GET /v1/agent/me returns scopes for a valid Bearer key", async () => {
    const bindings = testBindings();
    const app = createApp();
    const { agent } = await seedHouseholdWithMandateAndAgent(bindings, {
      scopes: ["quote", "read_list"],
    });

    const res = await app.fetch(
      new Request("http://localhost/v1/agent/me", {
        headers: { Authorization: `Bearer ${agent.secret}` },
      }),
      bindings,
    );
    expect(res.status).toBe(200);
    const body = AgentMeResponseSchema.parse(await res.json());
    expect(body.key_id).toBe(agent.keyId);
    expect(body.scopes).toEqual(["quote", "read_list"]);
    expect(body.mandate_ids).toEqual(agent.mandateIds);
  });

  it("GET /v1/agent/me rejects missing auth", async () => {
    const bindings = testBindings();
    const app = createApp();
    const res = await app.fetch(
      new Request("http://localhost/v1/agent/me"),
      bindings,
    );
    expect(res.status).toBe(401);
  });
});
