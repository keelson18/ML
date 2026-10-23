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

## Fresh checkout check - 2026-10-19

For the checkout based on HEAD `077859c`, the initial full Vitest suite passed (78 files / 469 tests), backend typecheck passed, and the migration-version check found 49 unique versions. These were local source/unit-test results only; no migrations were applied and no deployed Edge Function was contacted at that point. Subsequent read-only hosted database checks and current migration status are recorded below.

## Hosted paper-worker health follow-up - 2026-10-19

- Read-only checks against the configured non-local Supabase project found `research_collection_candles` present but `research_collection_state` absent; `verify_paper_schema` reported only the state table missing. The existing 20261021 migration creates both tables and is not safely replayable against this partial schema. Added a forward repair migration `20261025000000_restore_research_collection_state.sql` that creates only the missing state table and reapplies its service-only RLS/grant policy. This migration has **NOT** been applied: the available `DATABASE_URL` targets localhost:5432, and no hosted `SUPABASE_DB_URL` or CLI access token/login is configured.
- The accounting health RPC initially reported three failures. Read-only account analysis found three empty accounts (no open positions/trades), each implying $100,000 starting capital, while local `.env` configured `TRADER_STARTING_EQUITY=100`. After authorization, `.env` was changed to $100,000 to match those balances and the repository default; a fresh process invoking the hosted accounting RPC returned `verified`, 3 checked / 0 broken. Existing account rows were not modified. A running backend process must restart to load the corrected configuration.
- The research-state DDL still needs to be applied to the hosted project using its authorized migration workflow, then `verify_paper_schema` and the worker diagnostics should be rechecked. No worker/account state was reset.
- After the timeframe change and forward-repair migration were added, the full Vitest suite passed (78 files / 471 tests), backend typecheck and ESLint passed, and migration-version validation passed (50 unique versions). Hosted migration application remains blocked by missing remote migration access.
