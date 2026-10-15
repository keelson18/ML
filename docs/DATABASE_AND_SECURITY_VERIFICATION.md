# Database and security verification

## Architecture

The application uses Supabase Auth/PostgREST and PostgreSQL RPCs through `backend/src/db.ts` and the Supabase migrations. SQL migrations define RLS, service-only functions, paper account version checks and research governance. The pre-existing untracked `backend/src/db/postgres.ts` defines a direct `pg` pool using `DATABASE_URL`; repository search found no `postgresPool` import in `backend/src`, so it is not evidenced as an active application path. `.env.example` documents that variable but no database connection was made.

## Source-level safeguards

Migrations include owner-scoped policies and service-only RPC grants. Paper account writes use `record_paper_account_update`; research migration/test files cover immutable records, holdout registration and collection. These are source observations only. They do not establish effective deployed grants, RLS behavior, transaction atomicity or concurrency correctness.

## Verification performed

- `npm run check:migration-versions`: passed; 46 migration versions unique.
- `npm run backend:typecheck`: passed.
- `npm test`: 374 passed, 1 timed out in `backend/src/routes/market.test.ts` during parallel worker startup.
- `npm run test:research-holdout-concurrency`: prior implementation report records `ECONNREFUSED 127.0.0.1:54322`.
- No migration was applied; no database, RLS, effective privilege, cross-user, concurrent account update, holdout race or backup/restore test was run in this checkout.

## Required database verification

Use a disposable Supabase-compatible environment, explicitly verify its target before setup, and never run cleanup against production or a user database. Test fresh migration and supported upgrade paths; cross-user reads/writes; authenticated denial of service-only RPCs; atomic holdout claims; concurrent account version/CAS updates; duplicate event/ledger idempotency; immutable evidence; and restart recovery. Standalone PostgreSQL does not prove Supabase Auth/RLS compatibility. No destructive migration or data cleanup is approved by this document.

## Rollback and forward recovery

Prefer additive forward migrations. Before deployment, back up and inspect migration history, review SQL grants/policies and test rollback/recovery on disposable data. If a migration has been applied, do not rename or replay it; create a reviewed forward repair. Restore must preserve ledger and research evidence. Backup restoration remains untested.
