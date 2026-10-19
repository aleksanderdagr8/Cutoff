import { Hono } from "hono";
import type { ApiBindings } from "./bindings.js";
import { healthHandler } from "./handlers/health.js";
import { fakeCommitHandler } from "./handlers/fake-commit.js";
import {
  createHouseholdHandler,
  getHouseholdHandler,
} from "./handlers/households.js";
import { issueAgentHandler, revokeAgentHandler } from "./handlers/agents.js";
import {
  agentWidenMandateHandler,
  createMandateHandler,
  lowerCeilingHandler,
} from "./handlers/mandates.js";
import { quoteHandler } from "./handlers/quote.js";
import { commitHandler } from "./handlers/commit.js";
import {
  cancelOrderHandler,
  getOrderTrackingHandler,
  inboundFulfillWebhookHandler,
} from "./handlers/fulfill.js";
import { getReceiptHandler, skipReceiptHandler } from "./handlers/receipt.js";
import {
  getDueListHandler,
  getListHandler,
  reorderHandler,
  skipListLineHandler,
  upsertListLineHandler,
} from "./handlers/list.js";
import { getEvidencePackHandler } from "./handlers/evidence.js";
import { verifyOutboundWebhook } from "@cutoff/adapters";

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

  /** Human/console (service-role worker). */
  app.post("/v1/households", async (c) => {
    const body = await c.req.json().catch(() => null);
    const result = await createHouseholdHandler(c.env, body);
    if ("error" in result) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result, 201);
  });

  app.get("/v1/households/:householdId", async (c) => {
    const result = await getHouseholdHandler(
      c.env,
      c.req.param("householdId"),
      {
        authorization: c.req.header("Authorization") ?? undefined,
        memberId: c.req.header("X-Cutoff-Member-Id") ?? undefined,
        memberHouseholdId:
          c.req.header("X-Cutoff-Member-Household-Id") ?? undefined,
      },
    );
    if ("error" in result) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result);
  });

  app.post("/v1/households/:householdId/mandates", async (c) => {
    const body = await c.req.json().catch(() => null);
    const result = await createMandateHandler(
      c.env,
      c.req.param("householdId"),
      body,
    );
    if ("error" in result) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result, 201);
  });

  app.patch(
    "/v1/households/:householdId/mandates/:mandateId",
    async (c) => {
      const body = await c.req.json().catch(() => null);
      const result = await lowerCeilingHandler(
        c.env,
        c.req.param("householdId"),
        c.req.param("mandateId"),
        body,
      );
      if ("error" in result) {
        return c.json({ error: result.error }, result.status);
      }
      return c.json(result);
    },
  );

  app.post("/v1/households/:householdId/agents", async (c) => {
    const body = await c.req.json().catch(() => null);
    const result = await issueAgentHandler(
      c.env,
      c.req.param("householdId"),
      body,
    );
    if ("error" in result) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result, 201);
  });

  app.post(
    "/v1/households/:householdId/agents/:keyId/revoke",
    async (c) => {
      const result = await revokeAgentHandler(
        c.env,
        c.req.param("householdId"),
        c.req.param("keyId"),
      );
      if ("error" in result) {
        return c.json({ error: result.error }, result.status);
      }
      return c.json(result);
    },
  );

  /** Agent widen — always denied. */
  app.post("/v1/mandates/:mandateId/widen", async (c) => {
    const body = await c.req.json().catch(() => null);
    const result = await agentWidenMandateHandler(
      c.env,
      c.req.param("mandateId"),
      body,
      c.req.header("Authorization") ?? undefined,
    );
    if ("error" in result) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json(result);
  });

  app.post("/v1/quotes", async (c) => {
    const body = await c.req.json().catch(() => null);
    const result = await quoteHandler(
      c.env,
      body,
      c.req.header("Authorization") ?? undefined,
    );
    if ("error" in result) {
      const err = String(result.error);
      const payload: { error: string; quote_id?: string } = { error: err };
      if ("quote_id" in result && typeof result.quote_id === "string") {
        payload.quote_id = result.quote_id;
      }
      return c.json(payload, result.status as 401);
    }
    return c.json(result, 201);
  });

  app.post("/v1/commits", async (c) => {
    const body = await c.req.json().catch(() => null);
    const result = await commitHandler(c.env, body, {
      authorization: c.req.header("Authorization") ?? undefined,
      idempotencyKey: c.req.header("Idempotency-Key") ?? undefined,
    });
    if ("error" in result) {
      return c.json({ error: result.error }, result.status as 401);
    }
    return c.json(result, result.created ? 201 : 200);
  });

  /** Agent: order tracking / shipment events. */
  app.get("/v1/orders/:orderId", async (c) => {
    const result = await getOrderTrackingHandler(
      c.env,
      c.req.param("orderId"),
      c.req.header("Authorization") ?? undefined,
    );
    if ("error" in result) {
      return c.json({ error: result.error }, result.status as 401);
    }
    return c.json(result);
  });

  /** Unit 12: exportable evidence pack. */
  app.get("/v1/orders/:orderId/evidence", async (c) => {
    const result = await getEvidencePackHandler(
      c.env,
      c.req.param("orderId"),
      c.req.header("Authorization") ?? undefined,
    );
    if ("error" in result) {
      return c.json({ error: result.error }, result.status as 401);
    }
    return c.json(result);
  });

  /** Agent: cancel-before-ship. */
  app.post("/v1/orders/cancel", async (c) => {
    const body = await c.req.json().catch(() => null);
    const result = await cancelOrderHandler(
      c.env,
      body,
      c.req.header("Authorization") ?? undefined,
    );
    if ("error" in result) {
      return c.json({ error: result.error }, result.status as 401);
    }
    return c.json(result);
  });

  /** Unit 10: household receipt (human member session). */
  app.get("/v1/receipts/:token", async (c) => {
    const result = await getReceiptHandler(c.env, c.req.param("token"), {
      memberId: c.req.header("X-Cutoff-Member-Id") ?? undefined,
      memberHouseholdId:
        c.req.header("X-Cutoff-Member-Household-Id") ?? undefined,
    });
    if ("error" in result) {
      return c.json({ error: result.error }, result.status as 401);
    }
    return c.json(result);
  });

  app.post("/v1/receipts/:token/skip", async (c) => {
    const result = await skipReceiptHandler(c.env, c.req.param("token"), {
      memberId: c.req.header("X-Cutoff-Member-Id") ?? undefined,
      memberHouseholdId:
        c.req.header("X-Cutoff-Member-Household-Id") ?? undefined,
      agentAuthorization: c.req.header("Authorization") ?? undefined,
    });
    if ("error" in result) {
      return c.json({ error: result.error }, result.status as 401);
    }
    return c.json(result);
  });

  /** Unit 11: household list + reorder + skip. */
  app.get("/v1/list", async (c) => {
    const result = await getListHandler(
      c.env,
      c.req.header("Authorization") ?? undefined,
    );
    if ("error" in result) {
      return c.json({ error: result.error }, result.status as 401);
    }
    return c.json(result);
  });

  /** Unit 13: due / overdue list lines (fixed cadence). */
  app.get("/v1/list/due", async (c) => {
    const result = await getDueListHandler(
      c.env,
      c.req.header("Authorization") ?? undefined,
      c.req.query("within_days"),
    );
    if ("error" in result) {
      return c.json({ error: result.error }, result.status as 401);
    }
    return c.json(result);
  });

  app.post("/v1/households/:householdId/list", async (c) => {
    const body = await c.req.json().catch(() => null);
    const result = await upsertListLineHandler(
      c.env,
      c.req.param("householdId"),
      body,
    );
    if ("error" in result) {
      return c.json({ error: result.error }, result.status as 400);
    }
    return c.json(result, 201);
  });

  app.post("/v1/list/reorder", async (c) => {
    const body = await c.req.json().catch(() => null);
    const result = await reorderHandler(
      c.env,
      body,
      c.req.header("Authorization") ?? undefined,
    );
    if ("error" in result) {
      const err = String(result.error);
      const payload: { error: string; quote_id?: string } = { error: err };
      if ("quote_id" in result && typeof result.quote_id === "string") {
        payload.quote_id = result.quote_id;
      }
      return c.json(payload, result.status as 401);
    }
    return c.json(result, 201);
  });

  app.post("/v1/list/skip", async (c) => {
    const body = await c.req.json().catch(() => null);
    const result = await skipListLineHandler(
      c.env,
      body,
      c.req.header("Authorization") ?? undefined,
    );
    if ("error" in result) {
      return c.json({ error: result.error }, result.status as 401);
    }
    return c.json(result);
  });

  /** Inbound fulfiller webhook — signature required. */
  app.post("/v1/webhooks/fulfill", async (c) => {
    const raw = await c.req.text();
    let body: unknown = null;
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
    const signatureValid = await verifyOutboundWebhook(
      c.env.webhookSecret,
      {
        timestamp: c.req.header("x-cutoff-timestamp") ?? undefined,
        signature: c.req.header("x-cutoff-signature") ?? undefined,
      },
      raw,
    );
    const result = await inboundFulfillWebhookHandler(c.env, body, {
      signatureValid,
    });
    if ("error" in result) {
      return c.json({ error: result.error }, result.status as 401);
    }
    return c.json(result, result.created ? 201 : 200);
  });

  return app;
}

export type CutoffApp = ReturnType<typeof createApp>;
