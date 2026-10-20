# Supabase (Cutoff)

Versioned SQL for the **dedicated** Cutoff Supabase project (not AnswerWise).

- Migrations: [`migrations/`](./migrations/)
- How to apply: [`../docs/supabase-schema.md`](../docs/supabase-schema.md)

Repos: `createRepos({ mode })` / `resolveReposModeFromEnv()` in `@cutoff/db`.  
CI and local smoke stay on memory. Set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE` to select Postgres for orders, quotes, mandates, agent credentials (and thin households). Production `cutoff-api` refuses to boot in memory mode. Apply `20261020193151_lock_down_commit_and_rpc_execute.sql` manually before serving commits (`commit_order_record`).

Household sign-in codes, reset links, and the welcome email: [`../docs/household-auth-setup.md`](../docs/household-auth-setup.md). Apply `20261020211500_household_email_2fa.sql` before deploying the new `/home` auth pages. That file does not change `commit_order_record`.
