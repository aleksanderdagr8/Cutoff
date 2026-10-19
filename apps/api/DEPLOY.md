# Deploy `cutoff-api`

Worker name: `cutoff-api`  
Account: `6f016e176bf8507b75cecde460c5689d`

## Deploy

```bash
pnpm --filter @cutoff/api run deploy
```

GitHub Actions: `.github/workflows/deploy-api.yml` (secret `CLOUDFLARE_API_TOKEN`).

## Notes

- Cron trigger `*/15 * * * *` runs Unit 20 nudge row writer (`scheduled()`).
- Queues: `cutoff-nudges` + DLQ `cutoff-nudges-dlq` (Unit 21 consumer).
- `cutoff-mcp` service-binds to this Worker — deploy API **before** MCP.
- Worker entry must not touch Node `process` at module load (Workers runtime).
