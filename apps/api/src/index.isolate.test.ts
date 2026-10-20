import { afterEach, describe, expect, it } from "vitest";
import worker, {
  assertProductionDatabase,
  buildWorkerBindingsForTests,
  resetApiIsolateCacheForTests,
} from "./index.js";

afterEach(() => {
  resetApiIsolateCacheForTests();
});

describe("Worker isolate bindings cache", () => {
  it("reuses the same memory repos across builds (quote→commit across HTTP)", () => {
    const a = buildWorkerBindingsForTests();
    const b = buildWorkerBindingsForTests();
    expect(a.quotes).toBe(b.quotes);
    expect(a.orders).toBe(b.orders);
    expect(a.agents).toBe(b.agents);
    expect(a.traceId).not.toBe(b.traceId);
  });

  it("rebuilds when switching to a different repos cache key", () => {
    const memory = buildWorkerBindingsForTests();
    resetApiIsolateCacheForTests();
    const again = buildWorkerBindingsForTests();
    expect(again.quotes).not.toBe(memory.quotes);
  });

  it("refuses production traffic when Supabase credentials are missing", async () => {
    const env = { CUTOFF_ENV: "production" };
    const ctx = {} as ExecutionContext;
    expect(() => assertProductionDatabase(env)).toThrow(/SUPABASE_URL/);

    const health = await worker.fetch(
      new Request("http://localhost/health"),
      env,
      ctx,
    );
    expect(health.status).toBe(503);
    const body = (await health.json()) as {
      ok: boolean;
      reasons: string[];
    };
    expect(body.ok).toBe(false);
    expect(body.reasons).toContain("memory_repos");

    await expect(
      worker.fetch(
        new Request("http://localhost/v1/commits", { method: "POST" }),
        env,
        ctx,
      ),
    ).rejects.toThrow(/SUPABASE_SERVICE_ROLE/);

    await expect(
      worker.scheduled({} as ScheduledController, env, ctx),
    ).rejects.toThrow(/SUPABASE_URL/);
  });

  it("production with credentials still reports fake integrations on /health", async () => {
    const env = {
      CUTOFF_ENV: "production",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE: "service-role-test",
    };
    const health = await worker.fetch(
      new Request("http://localhost/health"),
      env,
      {} as ExecutionContext,
    );
    expect(health.status).toBe(503);
    expect(await health.json()).toMatchObject({
      ok: false,
      repos: "postgres",
      integrations: "fake",
      reasons: ["fake_integrations"],
    });
  });
});
