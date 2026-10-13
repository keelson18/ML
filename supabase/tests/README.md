# Database regression tests

Run these tests against a disposable local Supabase database after applying all migrations:

```sh
supabase start
supabase test db
```

`ledger_health.test.sql` runs in a transaction and rolls back its synthetic account and ledger rows. It checks empty chains, repeated event idempotency, optimistic-version retry rejection, empty-account health status, and privileged row-hash tampering detection. It does not touch a hosted project.

Concurrency still needs a two-session integration run. Both `record_paper_account_update` and `paper_ledger_health` take the same per-account advisory transaction lock; the SQL test verifies stale-version rejection but does not simulate overlapping transactions.
