# Autonomous paper trader gap audit

## Scope and evidence

Checkout: branch `main`, commit `d9356030222762da17eaa1a06d7d8defb7164166`, Node `v24.15.0`, npm `11.12.1`, Windows PowerShell. The working tree was dirty at inspection, including untracked `backend/src/db/postgres.ts`; therefore the commit does not capture all inspected code. See the implementation report's 2026-10-15 addendum for exact check results. No external database, provider, or deployment was accessed.

Status labels: **Verified** means a reproducible check ran; **Implemented** means source paths exist but integration proof is absent; **Partial** means some requirements are absent or unverified; **Blocked** means external infrastructure or credentials are needed.

| Priority / requirement | Evidence | Status | Consequence / next action |
|---|---|---|---|
| P0: paper-only scope and safe default | `backend/src/config.ts` parses `AUTONOMOUS_TRADING`; `backend/src/autonomy/paper-autopilot.ts` gates explicit runs; `docs/AUTONOMOUS_PAPER_TRADER_IMPLEMENTATION_REPORT.md` documents the server-side paper lifecycle. | Implemented; no live execution path found in the reviewed autopilot flow. | Keep the flag false. Audit any newly added execution code and verify deployment environment separately. |
| P0: closed candles and provider provenance | `backend/src/services/marketDataService.ts`, `backend/src/trader/planner.ts`, `backend/src/services/paperTradingService.ts`. | Partial | Unit code paths exist; provider contracts, actual freshness, provider mixing and end-to-end candle lineage were not exercised. Supply provider credentials in a protected environment and run a paper-only smoke test. |
| P0: risk gate and paper lifecycle | `backend/src/trader/risk.ts`, `backend/src/trader/executor.ts`, `backend/src/services/paperTradingService.ts`; regression tests cover gapped fill reapproval and cost-inclusive sizing. | Implemented in application logic; DB concurrency unverified. | Prove atomic approval, order creation, fills and ledger updates with competing DB sessions and retry/restart tests. |
| P0: migration safety, ownership, RLS and privileged RPC grants | `supabase/migrations/` and `supabase/tests/`; `docs/DB_APPLY.md`; `docs/MIGRATIONS.md`. | Partial / blocked | Source migrations and SQL tests exist, but no disposable Supabase DB was available. Run fresh and supported-upgrade tests, ownership/RLS tests and RPC authorization tests against disposable Supabase. Never reset a configured or production DB. |
| P0: worker lease/restart and position management | `backend/src/autonomy/paper-autopilot.ts`; latest migration `20261022000000_paper_autopilot_manage_open_positions_when_disabled.sql`. | Partial | Scheduler coordination is process-local per existing report. Keep deployment to one scheduler instance; add and test durable lease/recovery before multi-instance operation. |
| P0: readiness, pause and operations truth | `backend/src/server.ts`, `backend/src/services/adminOverview.ts`, `backend/src/routes/admin-overview.ts`. | Partial | API health alone does not establish provider, DB, worker, and risk readiness. Verify health degradation and pause behavior in a deployed paper environment. |
| P1: research collection, holdout and promotion | `backend/src/trader/research-collection.ts`, `backend/src/trader/research-run.ts`, research migrations and SQL tests; `docs/RESEARCH.md`. | Partial | Governance and evaluation source exist; durable collection restart, atomic holdout behavior and promotion were not proven against PostgreSQL. Run SQL/concurrency suite and an independently reproducible forward experiment. |
| P1: ledger-derived reporting and performance claims | `backend/src/trader/decision-ledger.ts`, admin overview and paper account reporting. | Partial | App-level accounting/reconciliation paths exist; no full persisted candle-to-ledger proof was run. Do not claim profitability. |
| P2: strategies and supported markets | `backend/src/trader/planner.ts`, `backend/src/services/marketDataService.ts`, `backend/src/constants/markets.ts`. | Partial | Existing report records active long-only setup and unverified metals sessions. Confirm provider symbol/quote mapping and session continuity before enabling XAUUSD or SilverUSD. |
| Build and regression evidence | `package.json`; current check results in implementation report addendum. | Verified locally, integration partial | Full suite passes (63 files / 377 tests) with `npm test -- --maxWorkers=4`; app/backend typechecks, lint and production build pass. The build reports a large `App` chunk. Disposable DB, provider and deployment checks remain blocked. |

## Verdict

**No.** The code contains significant paper-trading and research components, but the required database security/concurrency proof, provider-backed closed-candle lifecycle, worker recovery, and candle-to-reconciled-ledger test are absent. No real-money execution, profitability, or autonomous readiness claim is supported by this audit.

## Ordered closure steps

1. Start an explicitly disposable Supabase-compatible environment and record its target; test fresh migrations and a supported upgrade without touching user or production data.
2. Run SQL tests for RLS ownership, privileged RPC grants, holdout claim races, account CAS, idempotency, and ledger invariants.
3. Add/run a persisted candle-to-ledger integration scenario, including duplicate delivery, worker crash, restart, stale provider data and open-position management while entries are paused.
4. Verify data contracts and source freshness with authorized providers in paper-only mode; keep instruments without confirmed quote/session semantics disabled.
5. Keep using the passing controlled-worker suite command; monitor the large `App` bundle and verify production behavior in the target deployment.

Do not enable autonomous entries until P0 closure evidence is reproducible in the actual paper-only deployment.
