# Deploy `cutoff-api`

Worker name: `cutoff-api`  
Account: `6f016e176bf8507b75cecde460c5689d`

## Deploy

```bash
pnpm --filter @cutoff/api run deploy
```

GitHub Actions: `.github/workflows/deploy-api.yml` (secret `CLOUDFLARE_API_TOKEN`).

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

GitHub Actions `deploy-api` syncs these from repository Secrets `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE` when present; warns and skips when missing.

Optional later: `WEBHOOK_SECRET` (fulfill inbound), `STRIPE_SECRET_KEY` (real capture).

## Notes

- Cron trigger `*/15 * * * *` runs Unit 20 nudge row writer (`scheduled()`).
- Queues: `cutoff-nudges` + DLQ `cutoff-nudges-dlq` (Unit 21 consumer).
- `cutoff-mcp` service-binds to this Worker — deploy API **before** MCP.
- Worker entry must not touch Node `process` at module load (Workers runtime).
- Isolate caches repos across fetches (memory or postgres). Without Supabase secrets, cold isolates still cannot share memory state — use Postgres for live.
