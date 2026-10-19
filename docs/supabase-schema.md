# Supabase schema migrations

Versioned Postgres for Cutoff’s **dedicated** sandbox/production project. Matches `packages/db` `MODULE_TABLES` and memory repositories. **Not applied live yet** — CI stays on fakes until you create the project and secrets ([live sandbox](https://github.com/aleksanderdagr8/Cutoff/blob/main/README.md)).

## Layout

```
supabase/migrations/
  20261019150000_initial_cutoff_schema.sql   # tables + constraints
  20261019150100_rls_household_tables.sql    # RLS sketches + helper
```

Ownership map (do not cross-read from other packages):

| Module | Tables |
| --- | --- |
| principal | `principals`, `households`, `members` |
| agent_credential | `agent_credentials`, `revocations` |
| mandate | `mandates`, `mandate_lines` |
| catalog | `canonical_items`, `equivalences` |
| offer | `offers`, `offer_sources` |
| quote | `quotes`, `quote_holds` |
| commit | `orders` |
| ledger | `order_events`, `evidence` |
| pay | `charges`, `refunds` |
| fulfill | `fulfillment_jobs`, `shipment_events`, `return_requests` |
| risk | `merchant_scores`, `merchant_score_events`, `risk_*` |
| receipt | `receipts` |
| list | `list_lines` |
| edge | `idempotency_keys` (+ unique on `orders`) |

## Auth model (when wired)

| Client | Key | RLS |
| --- | --- | --- |
| `apps/api` Worker | `SUPABASE_SERVICE_ROLE` | Bypasses RLS (trusted server) |
| `apps/web` browser | `NEXT_PUBLIC_SUPABASE_ANON_KEY` + Auth JWT | Household SELECT via `members.auth_user_id = auth.uid()` |
| Agent | Bearer `ck_live_…` on Worker only | Never uses anon key |

Link `members.auth_user_id` when Auth lands. Until then, member policies match zero rows (fail closed); Worker service role still works.

## Apply when the Cutoff project exists

**Do not** reuse AnswerWise’s project. Use the Cutoff sandbox URL/keys from Project Settings → API.

### Option A — Supabase CLI (`db push`)

```bash
# Once per machine
npx supabase login
npx supabase link --project-ref <CUTOFF_PROJECT_REF>

# From repo root
npx supabase db push
```

`db push` applies every file in `supabase/migrations/` in timestamp order.

### Option B — SQL Editor

1. Open the Cutoff project → **SQL** → **New query**.
2. Paste and run `supabase/migrations/20261019150000_initial_cutoff_schema.sql`.
3. Paste and run `supabase/migrations/20261019150100_rls_household_tables.sql`.

Run in order. Do not commit service role keys, DB passwords, or `.env`.

## After apply

1. Confirm tables in **Table Editor**.
2. Confirm RLS is **enabled** on household tables.
3. Flip repos with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE` (see README / live-sandbox-setup). CI and `pnpm run smoke:local` stay on memory (`createRepos({ mode: "memory" })`).
4. Put `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE` / `NEXT_PUBLIC_*` only in local `.env` or Worker secrets — never in git.
5. Before quote/order against Postgres, seed `canonical_items` + `offers` (and households) in the DB — catalog/offer repos are still memory fixtures.
