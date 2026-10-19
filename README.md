# Cutoff

Buyer's agent decides when to reorder. Cutoff quotes, commits, and stands behind the bag.

## Layout

```
apps/web          human app (Next.js) — anon key only
apps/api          Cloudflare Worker (Hono)
packages/domain   pure rank / mandate / hold / catalog / quote / risk / fulfill
packages/db       repositories (memory now; Supabase later)
packages/adapters pay, fulfill, tax, offer feed, notify — fake + live
packages/contracts zod schemas + error codes
```

## Phase 4 (Unit 9)

Fulfill after capture, inbound/outbound signed webhooks, cancel-before-ship. No live aggregator required for CI exit.

```bash
pnpm install
pnpm run test:u0       # Unit 0 + Phase 1–4 suites (CI)
pnpm run test:phase4   # same as test:u0
pnpm run typecheck
pnpm run check:boundaries
```

## Agent auth

`Authorization: Bearer ck_live_…`  
Scopes: `quote`, `commit`, `read_list`. Revoked keys get `{ "error": "revoked" }`.

## Quote / Commit

`POST /v1/quotes` → `POST /v1/commits` with evidence + `Idempotency-Key`.  
Successful capture places via `FulfillAdapter`; place failure enqueues a refund.

## Fulfill / notify

- `GET /v1/orders/:orderId` — tracking + shipment events
- `POST /v1/orders/cancel` — cancel-before-ship when mandate `allow_cancel`
- `POST /v1/webhooks/fulfill` — signed inbound; deduped on `event_id`
