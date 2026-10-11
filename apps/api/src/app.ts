import { Hono } from "hono";
import type { ApiBindings } from "./bindings.js";
import { healthHandler } from "./handlers/health.js";
import { fakeCommitHandler } from "./handlers/fake-commit.js";

export type AppEnv = {
  Bindings: ApiBindings;
};

export function createApp() {
  const app = new Hono<AppEnv>();

  app.get("/health", (c) => {
    return c.json(healthHandler());
  });

  /** Phase 0 only — proves double-submit → one row against fakes. */
  app.post("/v1/_phase0/commits", async (c) => {
    const body = await c.req.json().catch(() => null);
    const result = await fakeCommitHandler(c.env, body, {
      idempotencyKey: c.req.header("Idempotency-Key") ?? undefined,
    });

    if ("error" in result && "status" in result) {
      return c.json({ error: result.error }, result.status as 400);
    }

    return c.json(result, result.created ? 201 : 200);
  });

  return app;
}

export type CutoffApp = ReturnType<typeof createApp>;
