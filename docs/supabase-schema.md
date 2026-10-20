# Supabase schema migrations

Versioned Postgres for Cutoff’s **dedicated** sandbox/production project. Matches `packages/db` `MODULE_TABLES` and memory repositories. **Not applied live yet** — CI stays on fakes until you create the project and secrets ([live sandbox](https://github.com/aleksanderdagr8/Cutoff/blob/main/README.md)).

## Layout

```
supabase/migrations/
  20261019150000_initial_cutoff_schema.sql   # tables + constraints
  20261019150100_rls_household_tables.sql    # RLS sketches + helper
  20261019160000_ensure_home_member.sql      # Auth bootstrap RPC for /home
  20261020090000_reorder_schedule.sql        # Unit 14 schedule + nudges + RLS
  20261020093000_home_durable_mutations.sql  # /home SECURITY DEFINER RPCs
  20261020193151_lock_down_commit_and_rpc_execute.sql  # anon EXECUTE revoke, quote unique, atomic commit, FK indexes
  20261020195427_household_stripe_customer.sql        # households.stripe_customer_id (Customer id, not a balance)
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
| list | `list_lines` (+ `cadence_source`, `last_ordered_at`, `next_due_at`, `snoozed_until`, `lead_days`; `learned_interval_days` reserved P4) |
| nudge | `household_nudge_settings`, `reorder_nudges` |
| edge | `idempotency_keys` (+ unique on `orders`) |

## Auth model (when wired)

| Client | Key | RLS |
| --- | --- | --- |
| `apps/api` Worker | `SUPABASE_SERVICE_ROLE` | Bypasses RLS (trusted server) |
| `apps/web` browser | `NEXT_PUBLIC_SUPABASE_ANON_KEY` + Auth JWT | Household SELECT via `members.auth_user_id = auth.uid()` |
| Agent | Bearer `ck_live_…` on Worker only | Never uses anon key |

Link `members.auth_user_id` via `ensure_home_member()` (SECURITY DEFINER RPC, `authenticated` only) on first `/home` sign-in. Until linked, member policies match zero rows (fail closed); Worker service role still works.

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
2. Paste and run each file in `supabase/migrations/` in timestamp order
   (schema → RLS → `ensure_home_member` → `reorder_schedule`).

Run in order. `20261020193151_lock_down_commit_and_rpc_execute.sql` then `20261020195427_household_stripe_customer.sql` are last. Do not commit service role keys, DB passwords, Stripe keys, or `.env`.

That last migration is **not** applied by deploy or by CI. Apply it yourself (`npx supabase db push` after `npx supabase link --project-ref <CUTOFF_PROJECT_REF>`, or paste the file into the SQL editor) **before** `cutoff-api` serves postgres commits. It revokes anon execute on the SECURITY DEFINER RPCs, stops `home_upsert_list_line_internal` from writing another household, sets `search_path` on `home_new_id`, adds `orders_quote_id_uidx`, creates `commit_order_record` (service role only), and indexes the unindexed foreign keys.

## After apply

1. Confirm tables in **Table Editor**.
2. Confirm RLS is **enabled** on household tables.
3. Flip repos with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE` (see README / live-sandbox-setup). CI and `pnpm run smoke:local` stay on memory (`createRepos({ mode: "memory" })`).
4. Put `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE` / `NEXT_PUBLIC_*` only in local `.env` or Worker secrets — never in git.
5. Before quote/order against Postgres, seed `canonical_items` + `offers` (and households) in the DB — catalog/offer repos are still memory fixtures.
