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
- `cutoff-mcp` service-binds to this Worker — deploy API **before** MCP.
