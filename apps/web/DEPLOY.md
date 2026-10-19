# Deploy `@cutoff/web` to Cloudflare Workers

OpenNext adapter → Worker `cutoff-web` on custom domains:

- `https://callcutoff.com` (apex) — full OpenNext app (`/`, `/home`, `/ops`)
- `https://www.callcutoff.com` → 308 redirect to apex (Worker + Next middleware)

Runtime secrets already set on the Worker via Cloudflare API (anon URL/key). Re-set after a wipe if needed.

## MIME / Content-Type (critical)

Workers Static Assets attach `Content-Type` from the **multipart part type at upload**. Wrangler sets this from the file extension. If you upload via the raw Assets API without a part `Content-Type`, Cloudflare serves `application/octet-stream` and browsers **will not apply CSS** (unstyled HTML, default blue links).

Prefer `pnpm --filter @cutoff/web run deploy` (Wrangler). If using a custom API/MCP path:

1. Set each asset part’s Content-Type (`text/css`, `application/javascript`, `font/woff2`, …).
2. Include `assets.config._headers` from `.open-next/assets/_headers` (see `public/_headers`) so Cache-Control + Content-Type overrides apply when assets are served ahead of the Worker.

After deploy, verify:

```bash
curl -sSI https://callcutoff.com/_next/static/css/<hash>.css | grep -i content-type
# expect: text/css
```

## One-time: secrets & Auth URLs

Do **not** commit secrets. Set them on the Worker (and Build vars if using Workers Builds):

| Name | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Worker secret **and** build var | Same Project URL as local |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Worker secret **and** build var | Anon / publishable only |
| `CUTOFF_HOME_DEV_BYPASS` | Wrangler `vars` (`0`) | Off in prod when Supabase public env is set |
| `CUTOFF_OPS_DEV_BYPASS` | Wrangler `vars` (`1`) | Stays on until operator TOTP |

CLI (from repo root, with `CLOUDFLARE_API_TOKEN` + account access):

```bash
cd apps/web
printf '%s' "$NEXT_PUBLIC_SUPABASE_URL" | pnpm exec wrangler secret put NEXT_PUBLIC_SUPABASE_URL
printf '%s' "$NEXT_PUBLIC_SUPABASE_ANON_KEY" | pnpm exec wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY
```

**GitHub Actions** (`deploy-web.yml`): store `CLOUDFLARE_API_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as repository **Secrets** (not Variables). Optional: `CLOUDFLARE_ACCOUNT_ID` (defaults in workflow).

**Aleks — Supabase Dashboard → Authentication → URL configuration**

1. Site URL → `https://callcutoff.com`
2. Redirect URLs → add `https://callcutoff.com/home/auth/callback` (keep localhost for local)
3. Leave Confirm email off for pilot if already configured that way

## Deploy (CLI)

```bash
export CLOUDFLARE_API_TOKEN=…   # Account: Workers Scripts Edit + Zone DNS Edit for callcutoff.com
export CLOUDFLARE_ACCOUNT_ID=6f016e176bf8507b75cecde460c5689d

pnpm install
pnpm --filter @cutoff/web run deploy
```

Custom domains are declared in `wrangler.jsonc` (`routes` + `custom_domain`). First deploy creates DNS for apex + www.

## Deploy (Cloudflare MCP / dashboard)

After CI merges this branch:

1. Workers & Pages → create/select Worker **`cutoff-web`**, or connect the GitHub repo with **Workers Builds**:
   - Root directory: `apps/web` (or build command from monorepo root — see below)
   - Build command: `cd ../.. && pnpm install && pnpm --filter @cutoff/web exec opennextjs-cloudflare build`
   - Deploy command: `pnpm --filter @cutoff/web exec opennextjs-cloudflare deploy` (or Wrangler deploy of `.open-next`)
2. Settings → Domains → Custom Domains: `callcutoff.com`, `www.callcutoff.com`
3. Settings → Variables: set the secrets above; keep bypass vars as in `wrangler.jsonc`
4. Or from a machine with token: `pnpm --filter @cutoff/web run deploy`

MCP (Reed) when zone/Worker write is authorized:

```text
wrangler deploy from apps/web after opennextjs-cloudflare build
— or —
PUT /accounts/{account_id}/workers/domains for callcutoff.com + www
```

## Local preview (Workers runtime)

```bash
pnpm --filter @cutoff/web preview
```

## Size note

Workers Free plan gzip limit is ~3 MiB. If deploy fails on size, upgrade the account Workers plan or trim the bundle before attaching the apex domain.
