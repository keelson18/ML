# Autonomous paper trader implementation plan

**Audit date:** 2026-10-14
**Starting revision:** `256dd3f1351bfc34d71ba562ab1597bf0aebac97`
**Starting worktree:** already contained edits in `backend/src/autonomy/paper-autopilot.test.ts`, `backend/src/autonomy/paper-autopilot.ts`, `backend/src/config.ts`, `backend/src/routes/admin-overview.ts`, `backend/src/routes/trader.ts`, `backend/src/server.ts`, `backend/src/services/adminOverview.ts`, `docs/multi-timeframe-implementation-report.md`, `src/components/Admin/SystemHealth.tsx`, `src/lib/backend-api.ts`, and `vite.config.ts`, plus untracked `backend/src/config.test.ts`, `backend/src/services/adminOverview.test.ts`, and this plan. These changes were preserved. The working tree is not a clean checkout.
**Constraint:** paper simulation only. No hosted database or live provider was contacted.

## Architecture and call flow

| Stage | Current production path | Verification boundary |
|---|---|---|
| Market data | `backend/src/services/marketDataService.ts` resolves canonical symbols, chooses configured Massive/Twelve Data adapters, validates normalized candles, hashes normalized candle content into dataset identity, coalesces requests, enforces quotas/cache bounds, and marks stale-cache responses. | Adapters and symbol mappings have unit coverage. Provider entitlement, exchange session behavior, stale responses, and actual quote semantics need credential-backed checks. |
| Analysis | `backend/src/autonomy/pipeline.ts` and `backend/src/engines/orchestrator.ts` run analysis and decision evidence. `backend/src/trader/planner.ts` is the separate paper-plan gate. | The general analysis engine can emit directional signals, but does not itself authorize a paper position. No calibrated win probability or profitability proof is available. |
| Plan | Autopilot fetches 1D/4H context, 1H setup, and 15M trigger series, selects closed candles, and calls `createTradePlan`. Current registered setup is bullish `trend-pullback`; the planner emits long plans only. | New 5M entry refinement is absent. 5M is position management. No bearish plan family is supported. |
| Entry | Scheduler calls `replayEntries` → `advanceStoredTradePlans` → `advanceTradePlan`. A closed trigger and independent entry gate are required; an order becomes eligible for fill on a later candle. Risk checks include valid stop direction, marks for all open positions, loss/drawdown, exposure, heat, duplicate-symbol/concurrency, market availability, and configured trade limits. | Deterministic tests cover helper and simulator behavior. No running provider-to-database end-to-end flow was exercised. |
| Position lifecycle | `manageOpenPositions` → side-aware `managePaperPosition` → `reducePaperPosition` manages closed candles, stop-first ambiguity, gaps, trailing/targets, fees, and partial reductions. `closeOpenPaperPosition` requires a fresh closed 1M candle. | The supported opening planner is long-only; short management math for persisted short rows does not establish supported short execution. |
| Persistence and ledger | `updateAccount` uses `record_paper_account_update` with expected version and derived idempotent events. SQL uses account locking/version checks; `reconcilePaperAccount` verifies cash/book/realized-P&L identity. Ledger hash and accounting health are separate checks. | SQL migration behavior, grants, RLS, concurrent transactions, and deployed history are unverified without disposable PostgreSQL. |
| Worker | `startServer` starts `paperAutopilotScheduler` when schema readiness passes and `NODE_ENV` is not `test`; with `AUTONOMOUS_TRADING=false`, it manages existing positions but does not authorize new entries. Scheduler fetch order prioritizes management then trigger then planner data; provider spacing uses quota configuration. Admin health reports worker liveness separately from entry authorization. | Process-local serialization is not a distributed lease. Deployment replica topology is unknown. API health is not proof of worker or account health. |
| Research | Authenticated research route collects immutable provider candles in bounded batches, and waits for 90 forward days / 8,640 15M bars and configured trade minimum before replay/persistence. Replay is chronological and costed; immutable evidence is promotion-gated. | No PostgreSQL collection/promotion/concurrency tests or provider run were possible. There is no background collector; missed provider lookback gaps fail closed. Non-crypto forward research is blocked until calendars are verified. |

### Instruments and configuration

The repository's configured product scope is BTCUSD, ETHUSD, XAUUSD, and SilverUSD. Provider mappings and entitlement are distinct from the canonical registry. Autopilot currently accepts only active, available Massive USD crypto markets; metal research is blocked pending session-calendar verification. Trader timeframe roles are 1D/4H context, 1H setup, 15M primary confirmation, and 5M management. Configuration retains a legacy 1H trigger option for stored-plan compatibility, but new plan creation is restricted to 15M.

**Provider mapping update (2026-10-15):** BTCUSD now uses Twelve Data `BTC/USD` after Massive failed the strict history probe. Active USD crypto markets mapped to Massive or Twelve Data may be selected for autopilot only after all five required timeframes pass the runtime availability gate. BTCUSD passed one strict history probe; sustained provider quota and uptime remain unverified.

## Baseline commands and results

Environment: Windows PowerShell, Node `v24.15.0`, npm `11.12.1`. The ordinary `npm ci` attempt failed with Windows `spawn EPERM` while running a dependency lifecycle process; retrying the same `npm ci` with process permission succeeded (`383 packages`, one deprecated `glob` warning). No manifest or lockfile changes resulted.

| Command | Result before implementation | Notes |
|---|---|---|
| `npm ci` | PASS after process-permission retry | Default attempt's exact failure was `Error: spawn EPERM`, `syscall: spawn`, `errno: -4048`. |
| `npm run typecheck` | PASS | Frontend TypeScript. |
| `npm run backend:typecheck` | PASS | Backend TypeScript. |
| `npm run lint` | PASS | ESLint. |
| `npm test` | PASS, 61 files / 360 tests | Ran with the pre-existing four-worker Vitest setting. An unbounded earlier run had one 5-second test timeout; the timed-out test passed alone. No test assertions/timeouts were changed. |
| `npm run build` | PASS | Vite transformed 1,615 modules; warns that `App` chunk is 922.50 kB (>500 kB). |
| `npm run check:env` | PASS | 55 code-read environment variables documented. |
| `npm run check:migration-versions` | PASS | 45 files, unique versions. |
| `git diff --check` | PASS | Existing report/config changes have no whitespace errors. |
| `npm run test:research-holdout-concurrency` | BLOCKED | Local `127.0.0.1:54322` refused connection. |
| `supabase test db` | BLOCKED | Supabase CLI not available. Docker client/daemon access, PostgreSQL, and `psql` are not usable in this environment. |

No hosted database, provider credentials, or authenticated browser session was used. Independent CI status was not queried.

## Confirmed limitations and implementation order

1. **Worker health accuracy:** verify the displayed worker diagnostics correspond to the actual paper autopilot scheduler and distinguish stopped/starting/running/degraded/blocked. Keep `/health` as API liveness only.
2. **Safety controls:** preserve fail-closed entry conditions and user opt-in. Do not add a live execution path. Confirm disabled/rejected states are observable and cannot be bypassed by a manual cycle request.
3. **Lifecycle evidence:** preserve the single supported plan → trigger → risk → pending order → later-candle fill → manager → ledger path. Expand tests only for reproduced defects; do not represent mocks as DB proof.
4. **Research governance:** preserve 90-day, trade-count, costs, baseline, and untouched holdout requirements. Keep promotion disabled for unverifiable evidence.
5. **Operational gaps:** do not add a database lease or migration without a disposable DB and deployment topology. Document exact operator steps to apply migrations and validate health.
6. **Strategy coverage:** do not add unvalidated bearish strategies or 5M entry refinement. Keep supported directions explicit until sizing, risk, execution, and management are tested end to end.
7. **Final verification/report:** run install, type, lint, tests, migration checks, and build; run SQL/E2E only if a disposable local environment is available. Record blockers and evidence in `docs/AUTONOMOUS_PAPER_TRADER_IMPLEMENTATION_REPORT.md`.

## Acceptance evidence

- A supported fresh closed-candle setup may create a stored plan; stale/open/missing evidence cannot.
- A plan must pass the independent risk gate, create an idempotent pending order, and only fill on a later eligible candle.
- Manager transitions are side-aware, conservative on same-candle ambiguity, and reconcile after fees/partial exits.
- A replayed cycle cannot duplicate fills or financial effects; reconciliation and hash-chain checks are reported separately.
- Research must accumulate an untouched, continuous forward window, include configured costs and baselines, and reject underpowered/failed evidence.
- Local deterministic tests prove application invariants; real DB/provider/runtime claims require corresponding integration evidence.
- Profitability remains unproven absent robust independent out-of-sample and forward paper results.

## Current implementation-session amendment

The source audit confirmed the gaps above and found a concrete risk-control defect: `LOSS_STREAK_LIMIT` and `LOSS_STREAK_COOLDOWN_BARS` were configured but not used in the stored-plan entry gate. The authoritative server-side gate now derives the latest consecutive losing **closed positions** from persisted paper trades, evaluates at the current closed candle's close time, ignores partial/open positions and future-dated trades, and blocks new orders for the configured trigger-timeframe bar cooldown. Existing risk thresholds were not changed. Regression coverage includes the pure cooldown boundary and a paper position opened, stopped out, and followed by a rejected plan. No migration was required.

This session also implemented the already documented requirement that `AUTONOMOUS_TRADING` parse as an explicit boolean with a safe false default and that account-run requests fail closed while disabled (these edits were already present in the working tree at session start and were preserved, not attributed to this implementation).

Fresh commands run in this session:

| Command | Result | Evidence boundary |
|---|---|---|
| `git status --short`; `git rev-parse HEAD`; `node --version`; `npm --version` | PASS | Revision `256dd3f1351bfc34d71ba562ab1597bf0aebac97`; Node `v24.15.0`; npm `11.12.1`; worktree had the pre-existing edits listed above. |
| `npm run backend:typecheck` | PASS after implementation | TypeScript backend check. |
| `npm run typecheck` | PASS | Frontend TypeScript check. |
| `npm run lint` | PASS | ESLint. |
| `npm run build` | PASS | Vite build; existing `App` chunk warning remains (~923 kB). |
| `npm run check:env` | PASS | 55 code-read environment variables documented. |
| `npm run check:migration-versions` | PASS | 45 migration files with unique versions. |
| `npm ls --depth=0` | PASS | Installed dependency tree matches declared top-level dependencies; no install or lockfile mutation. |
| `npx vitest run backend/src/trader/risk.test.ts --maxWorkers=1` | PASS | 13 risk tests, including cooldown interval, expiry boundary, future trades, wins, and open-position exclusions. |
| `npx vitest run backend/src/services/paperTradingService.test.ts --maxWorkers=1` | PASS | 8 service tests, including the stop-out then risk-denied plan flow. |
| `npm test -- --maxWorkers=4` and `npm test -- --maxWorkers=1 --reporter=dot --silent` | INVOKED; aggregate result not verified | Tool output did not return a final Vitest summary; do not infer a full-suite pass from partial output. |
| `npm run test:research-holdout-concurrency` | BLOCKED | PostgreSQL at `127.0.0.1:54322` refused connection (`ECONNREFUSED`). |
| `supabase test db` | NOT RUN | Execution policy denied the command; local Supabase/DB evidence unavailable. |
| `git diff --check` | PASS | No whitespace errors in the current patch at the time checked. |

No provider-backed, hosted-database, authenticated browser, E2E, or deployment-worker run was performed. Refer to `docs/AUTONOMOUS_PAPER_TRADER_IMPLEMENTATION_REPORT.md` for status by requirement and next steps.

### Follow-up worker hardening

A subsequent code audit found that a `paused_reason` could be cleared and the same scheduler cycle could proceed to create plans or advance entries. Entry authorization now requires the global switch, account enrollment, no current pause, and no required-data failure; manual runs reject paused accounts. Fresh data can clear a transient scheduler safety pause for a later cycle, but the paused cycle remains blocked. Disabled accounts no longer request new entry/planner data.

The scheduler now starts on schema-ready non-test deployments even when new entries are disabled, so it can keep managing existing paper positions. Migration `20261022000000_paper_autopilot_manage_open_positions_when_disabled.sql` extends the service-only worker account listing to include disabled accounts with open positions; idle disabled accounts remain excluded. Added `supabase/tests/paper_autopilot_management.test.sql` for those SQL invariants. Admin health now degrades for stale worker cycles and paused enrollment, and separates worker enabled from entries enabled. SQL behavior is specified but not executed here: the local database is unavailable and the `supabase test db` command is denied by this environment policy. Apply the new forward-only migration only after checking deployed migration history and grants.

### Reordered execution for this repository

1. Preserve and distinguish pre-existing worktree edits; use the current TypeScript/Vitest/Vite stack rather than replacing architecture.
2. Fix and regression-test the unused consecutive-loss lockout in the existing authoritative entry approval gate.
3. Keep database/provider-dependent items blocked until a disposable PostgreSQL/Supabase instance and authorized provider credentials are available; do not invent calendar integration, distributed leases, or integration-test results.
4. Publish the evidence-based status report, apply no schema migration in this session, and retain the explicit profitability caveat.
5. Resume deployment-level validation with production migration/grant audit, worker lease design for actual topology, required commodity session/calendar continuity, and end-to-end paper lifecycle tests against disposable PostgreSQL and real provider contracts.

Follow-up verification after the worker changes:

| Command | Result |
|---|---|
| `npx vitest run backend/src/autonomy/paper-autopilot.test.ts backend/src/services/adminOverview.test.ts backend/src/routes/admin-overview.test.ts backend/src/trader/risk.test.ts backend/src/services/paperTradingService.test.ts --maxWorkers=1 --reporter=dot --silent` | PASS; 5 files / 39 tests. |
| `npm run backend:typecheck`; `npm run typecheck`; `npm run lint`; `npm run build` | PASS; Vite retains existing ~923 kB chunk warning. |
| `npm run check:env`; `npm run check:migration-versions`; `git diff --check` | PASS; 55 documented environment variables and 46 unique migration versions. |
| `npm run test:research-holdout-concurrency` | BLOCKED; `ECONNREFUSED 127.0.0.1:54322`. |
| `supabase test db` | NOT RUN; execution policy denied the command. |
| Local browser smoke test | NOT RUN; dev server reported not ready, and process launch was denied by execution policy. |

The forward migration and its pgTAP regression test remain source-only until an authorized disposable Supabase/PostgreSQL environment is available. No migration was applied to a database.
