# Paper trading operations runbook

## Current operating boundary

This repository supports paper simulation and research only. `AUTONOMOUS_TRADING` defaults to false. Keep it false for migration, testing, and initial deployment verification. Do not connect a brokerage execution API or describe the simulator as real-money capable.

## Setup and preflight

1. Use the documented environment in `.env.example`; keep provider and Supabase service credentials server-side. Never put privileged values in `VITE_` variables.
2. Back up the target database. Compare its migration history with `supabase/migrations/`; apply only pending additive migrations using `docs/DB_APPLY.md` and `docs/MIGRATIONS.md`. Do not reset or replay an existing database.
3. Confirm Supabase URL, schema readiness, user ownership policies, service-only RPC grants, and ledger reconciliation in the target environment.
4. Confirm provider access, canonical symbol/quote mapping, fresh closed candles and session continuity. Keep unverified instruments blocked.
5. Start the persistent backend worker only after the fenced-lease migration is applied and the database lease tests pass. Until then, operate no more than one scheduler instance; source-level leases do not protect a deployment missing the migration.
6. Check API health plus authenticated system health, worker recency, provider freshness, paused state, risk checks, and ledger/accounting reconciliation. `/health` alone is liveness, not paper-trading readiness.

## Enabling and pausing

Only in an explicitly paper-only environment, after every preflight item passes, set `AUTONOMOUS_TRADING=true` and restart using the deployment's controlled configuration process. Record operator, environment, revision, and acknowledgement in the deployment/change audit. No setting in this repository makes live brokerage execution safe or available.

To stop new entries, set `AUTONOMOUS_TRADING=false` or pause the paper account, then confirm the worker reports entries disabled. Continue monitoring open paper positions: the worker is designed to manage them while entries are disabled, but exits require fresh management data. If data freshness, database writes, reconciliation or worker health fails, keep entries disabled and investigate before resuming.

## Failure handling and recovery

- Provider outage, stale/misaligned candles, invalid provenance: keep entries disabled; do not substitute synthetic quotes or manually mark a trade filled.
- Database outage or schema/reconciliation failure: keep entries disabled; preserve database and research evidence; restore from the approved backup procedure and verify in a disposable environment first.
- Worker crash: restart one instance, inspect persisted plan/account checkpoints and ledger before resuming. Unit replay coverage simulates resuming after a worker termination; a SQL rollback/retry pgTAP contract is present. Neither the SQL test nor a deployed restart recovery was run in this environment, so production recovery remains unverified.
- Duplicate processing or inconsistent ledger: pause entries and use the existing administrative reconciliation path only after a backup; preserve audit and ledger rows.
- Shut down by disabling entries, allow management work to checkpoint while dependencies are healthy, then stop the persistent process and verify final account/ledger reconciliation.

## Verification limitations

No backup restore, deployment restart, provider outage drill, DB outage drill, or candle-to-ledger recovery test was run for the audited checkout. These procedures require a disposable Supabase environment and protected provider credentials. See `AUTONOMOUS_PAPER_TRADER_GAP_AUDIT.md` and `DATABASE_AND_SECURITY_VERIFICATION.md` for evidence requirements.

## Release evidence required before enabling entries

- Apply migrations only to an explicitly disposable Supabase project first. Run all pgTAP tests and verify fresh install plus supported upgrade paths, RLS owner isolation, service-only RPC grants, stale-version rejection, idempotent writes, and injected failure rollback. Confirm the deployed `verify_paper_schema()` result before testing the backend against that same project.
- In a paper-only test account, capture a provider dataset ID and fresh closed candle, then follow one deterministic plan through pending order, confirmed paper fill, management update, exit, journal record, cash/equity reconciliation, ledger hash verification, backend restart, and duplicate replay. Compare pre/post restart account JSON and ledger rows. Do not use a production account for this test.
- Keep exactly one scheduler worker until migration `20261024000000_fenced_paper_autopilot_leases.sql` is deployed and its concurrent-worker/fencing database test passes. The account-write RPC rejects expired or superseded worker fences. On any data, provider, database, ledger, or reconciliation uncertainty, pause entries; keep position management enabled only while its required fresh marks and writes are healthy.
- `npm run check:secrets` must pass on the full reachable Git history after affected credentials have been rotated and an owner-approved history rewrite has completed. The current check reports historical secret-shaped material and credential-bearing Supabase CLI state; do not treat ignored local files as removal from history.
- CI must pass typechecks, lint, tests, build, environment/migration/secret checks. Confirm the hosted workflow run and required branch protection in GitHub before release. This repository does not add brokerage connectivity; execution remains paper-only.
