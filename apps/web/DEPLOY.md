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
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Wrangler `vars` **and** build env | Public gtag Measurement ID. Default / committed prod value: `G-3K4P4MPMPD`. Inlined into the client at **build** time — set in `deploy-web.yml` (or optional GitHub Variable). Not a secret. Empty string disables. |
| `GOOGLE_PLACES_API_KEY` | Worker secret (runtime) | Places API (New) for `/home/mandate` address typeahead. Server-only — never `NEXT_PUBLIC_`. Until set, UI shows a safe disabled placeholder. |
| `CUTOFF_HOME_DEV_BYPASS` | Wrangler `vars` (`0`) | Off in prod when Supabase public env is set |
| `CUTOFF_OPS_DEV_BYPASS` | Wrangler `vars` (`0`) | Ignored when `NODE_ENV=production`. Local `next dev` only |

### Google Analytics (gtag.js)

- Loads from root layout via `next/script` (`GoogleAnalytics`) on marketing (`/`), blog/docs, and household `/home` (including sign-in).
- Skips `/ops` (internal operator console).
- App Router client navigations call `gtag('config', id, { page_path })` so SPA route changes count as page views.
- No CSP is configured today; if one is added later, allow `script-src` / `connect-src` for `https://www.googletagmanager.com` and `https://www.google-analytics.com` (and `https://*.google-analytics.com` / `https://*.analytics.google.com` as GA4 requires).
- **Aleks:** nothing required to ship — ID is defaulted in code + `wrangler.jsonc` + deploy workflow. Optional: set GitHub Actions Variable `NEXT_PUBLIC_GA_MEASUREMENT_ID` to override without a code change.

Live Auth `/home` keys, mandate, and list persist via SECURITY DEFINER RPCs (`home_issue_agent_key`, `home_upsert_mandate`, …) — **no** service role in the web Worker. Agent quote/commit still needs `SUPABASE_*` on `cutoff-api` (see `apps/api/DEPLOY.md`).

CLI (from repo root, with `CLOUDFLARE_API_TOKEN` + account access):

```bash
cd apps/web
printf '%s' "$NEXT_PUBLIC_SUPABASE_URL" | pnpm exec wrangler secret put NEXT_PUBLIC_SUPABASE_URL
printf '%s' "$NEXT_PUBLIC_SUPABASE_ANON_KEY" | pnpm exec wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY
printf '%s' "$GOOGLE_PLACES_API_KEY" | pnpm exec wrangler secret put GOOGLE_PLACES_API_KEY
```

**GitHub Actions** (`deploy-web.yml`): store `CLOUDFLARE_API_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as repository **Secrets** (not Variables). Optional: `CLOUDFLARE_ACCOUNT_ID` (defaults in workflow). `GOOGLE_PLACES_API_KEY` is a **Worker runtime** secret (set via Wrangler above) — not required as a GitHub build secret unless you add it to the deploy workflow for a first-time put.

## Operator `/ops` — Cloudflare Access

Production does not mint a demo operator cookie. `CUTOFF_OPS_DEV_BYPASS=1` is ignored when `NODE_ENV` is `production`, and `wrangler.jsonc` sets it to `0`. `GET /api/ops/session` reports `dev_bypass: false`. `POST /api/ops/session` returns 503. Existing demo cookies are not accepted.

The app does not yet turn an Access identity into an operator session, so after Access is on, signed-in operators still see a closed sign-in. That is fail-closed: `/ops` data is the in-memory demo, and the public bypass is the bug this closes. Do not flip the var back on to "fix" sign-in.

Put Access in front before anyone needs the console (Cloudflare dashboard, not this repo):

1. Zero Trust → **Access controls** → **Applications** → **Add an application** → **Self-hosted**.
2. Name: `cutoff-ops`. Session duration: 24 hours is enough for a pilot.
3. Public hostnames (path is a prefix):
   - Domain `callcutoff.com`, path `/ops`
   - Domain `callcutoff.com`, path `/api/ops`
4. Policy: **Allow**, Include → **Emails** → the operator addresses. Everyone else stays denied.
5. `www` redirects to the apex before the app, so the apex policy is the one that matters.
6. `workers_dev` is still true, so `*.workers.dev` can skip the custom-domain policy. Add that hostname with the same paths, or turn **workers.dev** off for `cutoff-web`.
7. Leave `CUTOFF_OPS_DEV_BYPASS` at `0`. Do not set it as a Worker secret.

**Aleks — household Auth, SMTP, and the welcome email**

See `docs/household-auth-setup.md`. Apply the email-code migration before this Worker. Confirm email stays on. Custom SMTP is `smtp.resend.com:465`, user `resend`, from `noreply@callcutoff.com`.

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
