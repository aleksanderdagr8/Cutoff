# Deploy `cutoff-api`

Worker name: `cutoff-api`  
Public URL: `https://api.callcutoff.com`  
Account: `6f016e176bf8507b75cecde460c5689d`

## Deploy

```bash
pnpm --filter @cutoff/api run deploy
```

GitHub Actions: `.github/workflows/deploy-api.yml` (secret `CLOUDFLARE_API_TOKEN`).

DNS and the certificate for `api.callcutoff.com` are created when this Worker deploys (`[[routes]]` with `custom_domain = true`). `workers_dev` stays enabled as a fallback.

## Secrets (buy path)

Durable quote→commit needs Postgres mode. Set both on the Worker (never commit):

| Secret | Purpose |
| --- | --- |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE` | Service role key (bypasses RLS) |

```bash
printf '%s' "$SUPABASE_URL" | pnpm --filter @cutoff/api exec wrangler secret put SUPABASE_URL
printf '%s' "$SUPABASE_SERVICE_ROLE" | pnpm --filter @cutoff/api exec wrangler secret put SUPABASE_SERVICE_ROLE
```

`deploy-api` **fails** (does not deploy) when either GitHub secret is missing. The Worker also refuses production traffic if it would otherwise use in-memory repos (`CUTOFF_ENV=production` in `wrangler.toml`).

Set the same names as GitHub repository secrets (values are not stored in git):

```bash
gh secret set SUPABASE_URL
gh secret set SUPABASE_SERVICE_ROLE
```

Or put them on the Worker directly, then re-run deploy:

```bash
printf '%s' "$SUPABASE_URL" | pnpm --filter @cutoff/api exec wrangler secret put SUPABASE_URL
printf '%s' "$SUPABASE_SERVICE_ROLE" | pnpm --filter @cutoff/api exec wrangler secret put SUPABASE_SERVICE_ROLE
```

`/health` returns **503** in production while repos are in-memory or while pay/fulfill/tax/offer/email are still the fake adapters. Local `pnpm --filter @cutoff/api dev` overrides `CUTOFF_ENV` to `development` so memory mode can run.

Optional later: `WEBHOOK_SECRET` (fulfill inbound), `STRIPE_SECRET_KEY` (real capture).

Apply `supabase/migrations/20261020193151_lock_down_commit_and_rpc_execute.sql` **before** this Worker serves postgres commits (`commit_order_record`). See `docs/supabase-schema.md`. Do not apply it from CI.

## Notes

- Cron trigger `*/15 * * * *` runs Unit 20 nudge row writer (`scheduled()`).
- Queues: `cutoff-nudges` + DLQ `cutoff-nudges-dlq` (Unit 21 consumer).
- `cutoff-mcp` service-binds to this Worker — deploy API **before** MCP.
- Worker entry must not touch Node `process` at module load (Workers runtime).
- Isolate caches repos across fetches (memory or postgres). Production (`CUTOFF_ENV=production`) throws instead of serving memory repos. Local dev: `pnpm --filter @cutoff/api dev` sets `CUTOFF_ENV=development`.
