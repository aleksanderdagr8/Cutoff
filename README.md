# Cutoff

Buyer's agent decides when to reorder. Cutoff quotes, commits, and stands behind the bag.

## Layout

```
apps/web          human app (Next.js) — anon key only; /home/receipts/:token
apps/api          Cloudflare Worker (Hono)
packages/domain   pure rank / mandate / hold / catalog / quote / risk / score / fulfill / receipt / list
packages/db       repositories (memory now; Supabase later)
packages/adapters pay, fulfill, tax, offer feed (aggregator + brand), notify — fake + live
packages/contracts zod schemas + error codes
```

## Phase 6 (Unit 12)

Second source (brand feed) on top items; `merchant_scores` from events; evidence pack export; kill switch + merchant suspend. Fakes in CI.

```bash
pnpm install
pnpm run test:u0       # Unit 0 + Phase 1–6 suites (CI)
pnpm run test:phase6   # same as test:u0
pnpm run typecheck
pnpm run check:boundaries
```

## Agent auth

`Authorization: Bearer ck_live_…`  
Scopes: `quote`, `commit`, `read_list`. Revoked keys get `{ "error": "revoked" }`.

## Quote / Commit / List

`POST /v1/quotes` → `POST /v1/commits` with evidence + `Idempotency-Key`.  
`GET /v1/list` · `POST /v1/list/reorder` · `POST /v1/list/skip`  
Successful capture places via `FulfillAdapter` and issues a `receipt_token`.

## Evidence

- `GET /v1/orders/:orderId/evidence` — exportable pack (actor chain, quote hash, amount, fulfiller, rank inputs)

## Receipt (human)

- `GET /v1/receipts/:token` — member session headers; works if agent key revoked
- `POST /v1/receipts/:token/skip` — cancel before ship; return request after ship
- Web: `/home/receipts/[token]`

## Fulfill / notify

- `GET /v1/orders/:orderId` — tracking + shipment events
- `POST /v1/orders/cancel` — cancel-before-ship when mandate `allow_cancel`
- `POST /v1/webhooks/fulfill` — signed inbound; deduped on `event_id`
