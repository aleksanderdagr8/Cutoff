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

`/health` returns **503** in production while repos are in-memory or while fulfill/tax/offer/email are still fake. When `STRIPE_SECRET_KEY` is set, that 503 body includes `"payments": "stripe"` — pay is no longer the fake. Local `pnpm --filter @cutoff/api dev` overrides `CUTOFF_ENV` to `development` so memory mode can run.

Optional: `WEBHOOK_SECRET` (fulfill inbound HMAC). That secret is **not** the Stripe webhook secret.

## Stripe test mode (do not use live keys)

Per-order pay authorizes at commit and captures after placement. The $5/mo household plan is a separate Checkout subscription. Cutoff does not store a balance or hold funds: a failed place voids the authorization.

Use a [Stripe sandbox](https://docs.stripe.com/sandboxes) for test mode (separate from the shared test-mode sandbox when you can). Put a **restricted** test key (`rk_test_…`) in `STRIPE_SECRET_KEY`, not a live key and not a secret key (`sk_`) if a restricted key can do the job.

| Secret | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | Test restricted key. PaymentIntents write, Refunds write, Customers write, Checkout Sessions write, Subscriptions read, Prices read. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret (`whsec_…`) for `POST /v1/webhooks/stripe`. |
| `STRIPE_PRICE_ID` | Price for the household plan: **500** cents, `usd`, interval `month`. One Product, one monthly Price. |
| `STRIPE_APP_URL` | Optional. Checkout return origin. Default `https://callcutoff.com`. |

```bash
printf '%s' "$STRIPE_SECRET_KEY" | pnpm --filter @cutoff/api exec wrangler secret put STRIPE_SECRET_KEY
printf '%s' "$STRIPE_WEBHOOK_SECRET" | pnpm --filter @cutoff/api exec wrangler secret put STRIPE_WEBHOOK_SECRET
printf '%s' "$STRIPE_PRICE_ID" | pnpm --filter @cutoff/api exec wrangler secret put STRIPE_PRICE_ID
printf '%s' "$STRIPE_APP_URL" | pnpm --filter @cutoff/api exec wrangler secret put STRIPE_APP_URL
```

Create the $5 Price in the sandbox Dashboard (Product “Cutoff household”, Price $5.00 USD monthly) and copy its `price_…` id. Do not turn on Stripe Tax until you have an active registration — `automatic_tax` is left off.

Point a sandbox webhook endpoint at `https://<cutoff-api>/v1/webhooks/stripe` and subscribe to:

- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `charge.refunded`
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `charge.dispute.created`
- `radar.early_fraud_warning.created`

Local listener (test mode only, prints a `whsec_` to put in `STRIPE_WEBHOOK_SECRET`):

```bash
stripe listen --forward-to http://127.0.0.1:8787/v1/webhooks/stripe
```

Without `STRIPE_SECRET_KEY`, the API keeps `FakePayAdapter` for local dev and tests. Deploy does **not** fail when the Stripe secrets are unset.

Apply `supabase/migrations/20261020195427_household_stripe_customer.sql` after `20261020193151_lock_down_commit_and_rpc_execute.sql`. It adds `households.stripe_customer_id` (a Customer id, not a balance).

One more thing — if you'll be charging US or EU customers, you'll need to consider enabling Stripe Tax alongside Billing. See [Collect taxes for recurring payments](https://docs.stripe.com/billing/taxes/collect-taxes.md). Don't enable it here until a registration is active.

Apply `supabase/migrations/20261020193151_lock_down_commit_and_rpc_execute.sql` **before** this Worker serves postgres commits (`commit_order_record`). See `docs/supabase-schema.md`. Do not apply it from CI.

## Notes

- Cron trigger `*/15 * * * *` runs Unit 20 nudge row writer (`scheduled()`).
- Queues: `cutoff-nudges` + DLQ `cutoff-nudges-dlq` (Unit 21 consumer).
- `cutoff-mcp` service-binds to this Worker — deploy API **before** MCP.
- Worker entry must not touch Node `process` at module load (Workers runtime).
- Isolate caches repos across fetches (memory or postgres). Production (`CUTOFF_ENV=production`) throws instead of serving memory repos. Local dev: `pnpm --filter @cutoff/api dev` sets `CUTOFF_ENV=development`.
