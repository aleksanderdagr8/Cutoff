# Supabase (Cutoff)

Versioned SQL for the **dedicated** Cutoff Supabase project (not AnswerWise).

- Migrations: [`migrations/`](./migrations/)
- How to apply: [`../docs/supabase-schema.md`](../docs/supabase-schema.md)

Repos: `createRepos({ mode })` / `resolveReposModeFromEnv()` in `@cutoff/db`.  
CI and local smoke stay on memory. Set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE` to select Postgres for orders, quotes, mandates, agent credentials (and thin households).
