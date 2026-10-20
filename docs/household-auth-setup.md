# Household auth setup

Apply this by hand. Nothing here is deployed or written to the live database by the pull request.

Do this before shipping the web app. The new pages call RPCs from `supabase/migrations/20261020211500_household_email_2fa.sql`. Until that file is applied, a password sign-in cannot open a household.

`cutoff-api` keeps using the service role, which bypasses the new row policies, and still calls `commit_order_record`. This migration does not change that path. `stripe_customer_id` from the open Stripe migration is nullable and is not referenced here, so either file can be applied first.

## 1. Migration

Project ref: `olzbepsrdevuguehczsy`.

```bash
npx supabase login
npx supabase link --project-ref olzbepsrdevuguehczsy
npx supabase db push
```

Or paste `supabase/migrations/20261020211500_household_email_2fa.sql` into the SQL editor and run it once.

It adds:

- `private.email_challenges` and `private.email_2fa_grants` (RLS on, no client policies)
- `public.member_welcome_emails` (RLS on, writes only for `service_role`)
- RPCs `home_email_2fa_status`, `home_email_2fa_may_send`, `home_begin_email_2fa`, `home_verify_email_2fa`, `home_clear_email_2fa` granted to `authenticated` only

## 2. Custom SMTP

Authentication → Emails → SMTP settings:

| Setting | Value |
| --- | --- |
| Enable custom SMTP | on |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | the Resend API key (not committed) |
| Sender email | `noreply@callcutoff.com` |
| Sender name | `Cutoff` |

Confirm email: on.

Authentication → Emails → Templates. Paste the HTML and set the subject:

| Template | Subject | File |
| --- | --- | --- |
| Confirm signup | `Confirm your Cutoff account` | `supabase/templates/confirmation.html` |
| Reset password | `Reset your Cutoff password` | `supabase/templates/recovery.html` |
| Reauthentication | `{{ .Token }} is your Cutoff code` | `supabase/templates/reauthentication.html` |

The confirm and reset templates link to `{{ .SiteURL }}/home/auth/confirm` with `token_hash`, so they work when the inbox is opened on another device. The code template prints `{{ .Token }}`.

OTP expiry in Auth can stay at the default (1 hour). The app stops accepting a code 10 minutes after it was sent.

## 3. URL configuration

Authentication → URL configuration:

- Site URL: `https://callcutoff.com`
- Redirect URLs:
  - `https://callcutoff.com/home/auth/callback`
  - `https://callcutoff.com/home/auth/confirm`
  - `http://localhost:3000/home/auth/callback`
  - `http://localhost:3000/home/auth/confirm`

## 4. Welcome email

The function source is `supabase/functions/welcome-member`. It is not deployed from this repo.

```bash
npx supabase secrets set --project-ref olzbepsrdevuguehczsy \
  RESEND_API_KEY=... \
  WELCOME_WEBHOOK_SECRET=...
npx supabase functions deploy welcome-member --no-verify-jwt --project-ref olzbepsrdevuguehczsy
```

`WELCOME_WEBHOOK_SECRET` must be at least 16 characters. Do not commit either value.

Database → Webhooks → Create:

- Table `public.members`, event Insert
- URL `https://olzbepsrdevuguehczsy.supabase.co/functions/v1/welcome-member`
- Header `Authorization: Bearer <WELCOME_WEBHOOK_SECRET>`
- HTTP method POST

The mail is from `Cutoff <team@callcutoff.com>` through Resend's HTTP API. It sends once per member, when the member row is created after the email code succeeds.

## 5. Web app

Deploy `cutoff-web` only after the migration is applied. Leave `CUTOFF_HOME_DEV_BYPASS` at `0`. A production build ignores that flag even if it is set to `1`.
