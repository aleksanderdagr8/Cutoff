# Apply the atomic commit migration

This PR does **not** apply SQL and does **not** deploy. Run the steps below yourself on project `olzbepsrdevuguehczsy` (Cutoff). Do not point this at any other Supabase project.

The Worker-to-Postgres wiring is a separate change. These steps only install the commit function and the ledger guards. Tests keep using the in-memory repositories.

## What you are applying

`supabase/migrations/20261020212010_atomic_quote_commit.sql`

It:

- Keeps `orders.quote_id` unique (one order per quote).
- Replaces `commit_order_record` so one call writes the order, the `committed` ledger event, the evidence pack, and the idempotency key, then marks the quote used. That function body is the transaction.
- Locks the quote row and the idempotency key for the duration of that transaction. A second call with the same key, or any second call for that quote, returns the original order id.
- Refuses `UPDATE`, `DELETE`, and `TRUNCATE` on `order_events` and `evidence`. New statuses are new rows.
- Grants execute to `service_role` only.

Payment and placement stay outside this function. `PostgresOrderRepository.recordEvidencedCommit` is the caller. The in-memory repository uses the same rule so CI does not need a database.

Prerequisite: `20261020193151_lock_down_commit_and_rpc_execute.sql` (and every migration before it) is already applied. This file does not change login, 2FA, password reset, welcome email, or the ops dev bypass.

## Checklist

1. Confirm the project ref is `olzbepsrdevuguehczsy`.
2. From the repo root, link once if this machine is not linked:

   ```bash
   npx supabase login
   npx supabase link --project-ref olzbepsrdevuguehczsy
   ```

3. Apply pending files. `db push` skips migrations already recorded on the project:

   ```bash
   npx supabase db push
   ```

   Or paste `supabase/migrations/20261020212010_atomic_quote_commit.sql` into the SQL editor and run it once. Do not re-run older files by hand if they are already applied.

4. Read back the guards (SQL editor). You want one unique index, the function, and four triggers:

   ```sql
   select indexdef
   from pg_indexes
   where schemaname = 'public' and indexname = 'orders_quote_id_uidx';

   select proname
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and proname = 'commit_order_record';

   select tgname
   from pg_trigger
   where tgrelid in ('public.order_events'::regclass, 'public.evidence'::regclass)
     and not tgisinternal
   order by tgname;
   ```

5. Leave secrets out of git. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE` belong in Worker secrets when the API wiring change lands. This checklist does not set them and does not deploy `cutoff-api`.
