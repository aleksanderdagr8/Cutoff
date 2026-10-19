# Deploy `cutoff-mcp`

Worker name: `cutoff-mcp`  
Public URL: `https://mcp.callcutoff.com/mcp`  
Account: `6f016e176bf8507b75cecde460c5689d`

## Prerequisites

1. **`cutoff-api` Worker must already exist** in the account (service binding `API` → `cutoff-api`). Deploy it first: `pnpm --filter @cutoff/api run deploy` or workflow `deploy-api`. Without it, `deploy-mcp` fails with Cloudflare error `10143` (Worker not found).
2. Cloudflare API token with Workers edit + route permissions (`CLOUDFLARE_API_TOKEN` repo secret — same as `deploy-web`).
3. DNS for `mcp.callcutoff.com` is created on first deploy via `custom_domain = true`.

## Local

```bash
pnpm --filter @cutoff/mcp run deploy
```

Or with an explicit token:

```bash
cd apps/mcp && CLOUDFLARE_API_TOKEN=… pnpm exec wrangler deploy
```

## GitHub Actions

Workflow: `.github/workflows/deploy-mcp.yml`  
Secrets: `CLOUDFLARE_API_TOKEN` (required). Optional: `CLOUDFLARE_ACCOUNT_ID` (defaults to the account in `wrangler.toml`).

## Rate limits

| Binding | Limit | Window | Key |
|---|---|---|---|
| `QUOTE_RATE_LIMITER` | 30 | 60s | agent `key_id` |
| `COMMIT_RATE_LIMITER` | 5 | 60s | agent `key_id` |

Exceeded limits return an MCP tool result (`isError: true`, `error: "rate_limited"`), not a JSON-RPC protocol error.

## Verify

```bash
curl -sS https://mcp.callcutoff.com/health
# {"ok":true,"service":"cutoff-mcp",…}

curl -sS -X POST https://mcp.callcutoff.com/mcp \
  -H "Authorization: Bearer ck_live_…" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```
