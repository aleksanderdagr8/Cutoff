# Cutoff

Buyer's agent decides when to reorder. Cutoff quotes, commits, and stands behind the bag.

## Layout

```
apps/web          human app (Next.js → OpenNext Workers) — `/` marketing, `/home`, `/ops`; see apps/web/DEPLOY.md
apps/api          Cloudflare Worker (Hono)
packages/domain   pure rank / mandate / hold / catalog / quote / risk / score / fulfill / receipt / list
packages/db       repositories (memory default; Postgres when Supabase env set)
packages/adapters pay, fulfill, tax, offer feed (aggregator + brand), notify — fake + live
packages/contracts zod schemas + error codes
supabase/         versioned SQL migrations (not applied live until sandbox project exists)
```

## Supabase schema + Postgres repos

Migrations live in `supabase/migrations/` and match `packages/db` table ownership. Apply to the **dedicated Cutoff** project only (not AnswerWise):

```bash
npx supabase link --project-ref <CUTOFF_PROJECT_REF>
npx supabase db push
```

Or paste the SQL files in order in the Supabase SQL Editor. Full steps: [docs/supabase-schema.md](./docs/supabase-schema.md).

**Repository mode:** `createRepos({ mode: "memory" | "postgres" })` (default `memory`).  
`resolveReposModeFromEnv()` selects `postgres` only when both `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE` are set; otherwise memory. Unit tests and CI stay on memory. Optional live check: `packages/db` `postgres.integration.test.ts` (skipped without those env vars). Catalog/offers remain in-memory until those adapters land — seed durable parents in Postgres before quote/order writes.

## Human dashboards (local)

**`/home` Auth:** with `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` set and `CUTOFF_HOME_DEV_BYPASS` unset/0 → Supabase email+password; first sign-in runs `ensure_home_member` (links `auth.users` → `members.auth_user_id`). Escape hatch: `CUTOFF_HOME_DEV_BYPASS=1` (cookie demo). If public Supabase env is missing, bypass stays on automatically.

**`/ops`:** still uses `CUTOFF_OPS_DEV_BYPASS` until operator TOTP lands.

```bash
pnpm install
pnpm --filter @cutoff/web dev
# http://localhost:3000/home  — household (Auth or bypass)
# http://localhost:3000/ops   — operator  (CUTOFF_OPS_DEV_BYPASS=1 default)
```

**Production:** [`https://callcutoff.com`](https://callcutoff.com) (`cutoff-web` Worker). Deploy: `pnpm --filter @cutoff/web run deploy` — details in [`apps/web/DEPLOY.md`](./apps/web/DEPLOY.md).

Bypass-only (CI / no Auth secrets):

```bash
CUTOFF_HOME_DEV_BYPASS=1 CUTOFF_OPS_DEV_BYPASS=1 pnpm --filter @cutoff/web dev
```

- **`/home`** — sign-in · list (skip/pause) · receipt · mandate & keys. Agent secrets shown once; never browser storage.
- **`/ops`** — live flow · order sheet · households / mandates (lower ceiling only) / fulfillers / audit.

CI / package checks:

```bash
pnpm run test:u0       # Unit 0 + Phase 1–6 suites (CI)
pnpm run smoke:local   # quote → commit ×2 → receipt against fakes (no network)
pnpm run typecheck
pnpm run check:boundaries
```

## Phase 6 (Unit 12)

Second source (brand feed) on top items; `merchant_scores` from events; evidence pack export; kill switch + merchant suspend. Fakes in CI.

## Phase 7 (Unit 13)

Fixed-cadence due list for agents: `GET /v1/list/due?within_days=7`. `ListLine` includes `display_name` + `next_due_at` (`computeNextDue` in `@cutoff/domain`). Learned cadence deferred.

## Phase 8 (Unit 14)

Reorder schedule persistence: migration `20261020090000_reorder_schedule.sql` (`list_lines` due columns, `household_nudge_settings`, `reorder_nudges` + RLS). Memory + Postgres list/nudge repos; learned cadence columns reserved unused.

## Phase 9 (Unit 15)

`POST /v1/list/skip` modes `next` | `snooze` | `pause` (default pause). Optional `nudge_id` on reorder → acted + `resolved_order_id` on commit. Pending nudges skipped on skip.

## Phase 10 (Unit 16)

Agent-readable `GET /v1/orders/:orderId` receipt summary (allowlist serializer, `summary`, `why_this_seller`, `receipt_url`). No-PII contract test.

## Phase 11 (Unit 17)

MCP scaffold (`apps/mcp`): Streamable HTTP `/mcp`, service binding to `cutoff-api`, Bearer passthrough, scope-filtered `tools/list`. `GET /v1/agent/me` for introspect. Tool bodies land in Unit 18.

## Agent auth

`Authorization: Bearer ck_live_…`  
Scopes: `quote`, `commit`, `read_list`. Revoked keys get `{ "error": "revoked" }`.

## Quote / Commit / List

`POST /v1/quotes` → `POST /v1/commits` with evidence + `Idempotency-Key`.  
`GET /v1/list` · `GET /v1/list/due` · `POST /v1/list/reorder` · `POST /v1/list/skip`  
Successful capture places via `FulfillAdapter` and issues a `receipt_token`.

## Evidence

- `GET /v1/orders/:orderId` — agent receipt summary (allowlisted; `summary` + why-this-seller)
- `GET /v1/orders/:orderId/evidence` — exportable pack (actor chain, quote hash, amount, fulfiller, rank inputs)

## Receipt (human)

- `GET /v1/receipts/:token` — member session headers; works if agent key revoked
- `POST /v1/receipts/:token/skip` — cancel before ship; return request after ship
- Web: `/home/receipts/[token]`

## Fulfill / notify

- `GET /v1/orders/:orderId` — tracking + shipment events
- `POST /v1/orders/cancel` — cancel-before-ship when mandate `allow_cancel`
- `POST /v1/webhooks/fulfill` — signed inbound; deduped on `event_id`
