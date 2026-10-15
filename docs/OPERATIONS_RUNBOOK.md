# Paper trading operations runbook

## Current operating boundary

This repository supports paper simulation and research only. `AUTONOMOUS_TRADING` defaults to false. Keep it false for migration, testing, and initial deployment verification. Do not connect a brokerage execution API or describe the simulator as real-money capable.

## Setup and preflight

1. Use the documented environment in `.env.example`; keep provider and Supabase service credentials server-side. Never put privileged values in `VITE_` variables.
2. Back up the target database. Compare its migration history with `supabase/migrations/`; apply only pending additive migrations using `docs/DB_APPLY.md` and `docs/MIGRATIONS.md`. Do not reset or replay an existing database.
3. Confirm Supabase URL, schema readiness, user ownership policies, service-only RPC grants, and ledger reconciliation in the target environment.
4. Confirm provider access, canonical symbol/quote mapping, fresh closed candles and session continuity. Keep unverified instruments blocked.
5. Start a persistent backend worker. Current scheduler coordination is process-local, so operate no more than one scheduler instance until durable leases and multi-worker recovery are implemented and tested.
6. Check API health plus authenticated system health, worker recency, provider freshness, paused state, risk checks, and ledger/accounting reconciliation. `/health` alone is liveness, not paper-trading readiness.

## Enabling and pausing

Only in an explicitly paper-only environment, after every preflight item passes, set `AUTONOMOUS_TRADING=true` and restart using the deployment's controlled configuration process. Record operator, environment, revision, and acknowledgement in the deployment/change audit. No setting in this repository makes live brokerage execution safe or available.

To stop new entries, set `AUTONOMOUS_TRADING=false` or pause the paper account, then confirm the worker reports entries disabled. Continue monitoring open paper positions: the worker is designed to manage them while entries are disabled, but exits require fresh management data. If data freshness, database writes, reconciliation or worker health fails, keep entries disabled and investigate before resuming.

## Failure handling and recovery

- Provider outage, stale/misaligned candles, invalid provenance: keep entries disabled; do not substitute synthetic quotes or manually mark a trade filled.
- Database outage or schema/reconciliation failure: keep entries disabled; preserve database and research evidence; restore from the approved backup procedure and verify in a disposable environment first.
- Worker crash: restart one instance, inspect persisted plan/account checkpoints and ledger before resuming. Current restart recovery is not proven by integration tests.
- Duplicate processing or inconsistent ledger: pause entries and use the existing administrative reconciliation path only after a backup; preserve audit and ledger rows.
- Shut down by disabling entries, allow management work to checkpoint while dependencies are healthy, then stop the persistent process and verify final account/ledger reconciliation.

## Verification limitations

No backup restore, deployment restart, provider outage drill, DB outage drill, or candle-to-ledger recovery test was run for the audited checkout. These procedures require a disposable Supabase environment and protected provider credentials. See `AUTONOMOUS_PAPER_TRADER_GAP_AUDIT.md` and `DATABASE_AND_SECURITY_VERIFICATION.md` for evidence requirements.
