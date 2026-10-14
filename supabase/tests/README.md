# Database regression tests

Run these tests against a disposable local Supabase database after applying all migrations:

```sh
supabase start
supabase test db
```

`ledger_health.test.sql` runs in a transaction and rolls back its synthetic account and ledger rows. It checks empty chains, repeated event idempotency, optimistic-version retry rejection, empty-account health status, and privileged row-hash tampering detection. It does not touch a hosted project.

`research_collection.test.sql` checks the service-only candle collection table/RPC, append-only triggers, an initial bounded four-timeframe baseline, and an idempotent retry. It runs in a transaction and rolls back its fixture. The local DB suite must be run after applying the forward-only `20261021000000_accumulate_research_holdout_candles.sql` migration.

`scripts/test-research-holdout-concurrency.mjs` uses separate local PostgreSQL sessions to verify overlapping holdout claims serialize, adjacent intervals pass, and concurrent identical candle collection is idempotent. It refuses any database other than localhost port 54322. Account-write concurrency still needs a two-session integration run; the ledger SQL test verifies stale-version rejection but not overlapping transactions.
