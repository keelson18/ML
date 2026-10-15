# Autonomous paper trader implementation report

## Verification addendum — 2026-10-15 checkout

This addendum records a fresh check of the repository at `d9356030222762da17eaa1a06d7d8defb7164166` (branch `main`). The working tree was already dirty, including untracked `backend/src/db/postgres.ts`; the commit SHA alone does not identify that file or other pre-existing local changes. No database, provider, deployment, migration application, or browser session was used. `AUTONOMOUS_TRADING` was not enabled.

### Implemented in this continuation

`backend/src/trader/executor.ts` now reruns the entry gate at the actual modeled fill price for a later candle, including a gap open, instead of the stale pending-order level. This prevents reward/risk and sizing approval at a price the paper simulator will not receive. `backend/src/trader/risk.ts` now budgets per-unit stop risk for configured entry/exit fees and slippage; portfolio heat uses cost-inclusive risk in the stored-plan path and replay, and replay passes its selected cost configuration into sizing. `backend/src/trader/executor.test.ts` covers a gapped fill denied by the actual-price gate, and `backend/src/trader/risk.test.ts` checks cost-inclusive sizing and heat. Lifecycle fixtures now use a fill at the planned level when expecting approval. The live-import boundary regression test traverses the decision-code import graph once rather than repeat overlapping walks, removing its parallel-suite timeout without weakening the assertion. The pre-existing PostgreSQL pool source lost its local `pg` suppression during this continuation; `@types/pg` is now a dev dependency so the backend typecheck covers that file. These changes do not establish PostgreSQL atomicity, broker execution, or real market fills.

| Command | Result |
|---|---|
| `npm run backend:typecheck` | PASS, exit 0. |
| `npm run typecheck` | PASS, exit 0 on rerun. |
| `npm run lint` | PASS, exit 0. |
| `npm run check:env` | Initially failed (exit 1): `DATABASE_URL` read by the pre-existing untracked `backend/src/db/postgres.ts` was undocumented. `.env.example` now documents it as a direct PostgreSQL URL; rerun passed, all 56 reads documented. |
| `npm run check:migration-versions` | PASS, exit 0; 46 migration files, unique versions. |
| `npm test` | FAIL, exit 1; 374 passed / 1 failed of 375. The market route authentication test timed out during high parallel startup. |
| `npm test -- --maxWorkers=4` (first run after fill-gate change) | FAIL, exit 1; exposed four lifecycle fixtures that assumed a gapped fill remained eligible, then the live-import scan exceeded its timeout. Fixtures and the redundant scan were corrected. |
| `npm test -- --maxWorkers=4` (final run) | PASS, exit 0; 63 files / 377 tests. |
| `npx vitest run backend/src/trader/risk.test.ts backend/src/trader/replay.test.ts backend/src/services/paperTradingService.test.ts backend/src/trader/executor.test.ts --maxWorkers=1` | PASS, exit 0; 4 files / 36 tests, including cost-aware sizing and actual gap-price gating. |
| `npx vitest run backend/src/live/import-boundary.test.ts --maxWorkers=1` | PASS, exit 0; 1 test after reducing repeated graph traversal. |
| `npm run build` | Initial sandbox run failed at esbuild startup with `spawn EPERM`. Rerun outside the sandbox passed, exit 0; 1,615 modules transformed. Existing `App` chunk warning remains (~922.62 kB minified). |
| `npm run lint` | PASS, exit 0 after implementation edits. |
| `npm run typecheck` | PASS, exit 0. |
| `npm run backend:typecheck` | PASS, exit 0 after implementation edits. |
| `npm install --save-dev @types/pg` | PASS after sandbox cache miss; added only the type package to `package.json` and lockfile. Subsequent `npm audit` reported zero vulnerabilities. |
| `npm ls --depth=0` | PASS, exit 0; installed top-level dependency tree resolved. |
| `npm audit` | PASS, exit 0; zero vulnerabilities reported by npm audit for the lockfile state inspected. |
| `npm run test:research-holdout-concurrency` | BLOCKED, exit 1; connection refused at `127.0.0.1:54322`. No database test was run. |
| `git diff --check` | PASS, exit 0 after edits. |

The existing P0 limitations below remain: no disposable Supabase/PostgreSQL migration, RLS/grant, concurrency, restore, or candle-to-ledger integration run; no live provider or deployed worker verification; and no evidence supporting profitability. The checkout is **not verified as an autonomous paper trader**. The environment example addition documents the already-present local pool source; it does not enable or connect that pool.

**Audit revision:** `256dd3f1351bfc34d71ba562ab1597bf0aebac97`  
**Verification environment:** Node `v24.15.0`, npm `11.12.1`  
**Overall status:** **Partial implementation; not a fully validated autonomous trader.** The repository contains a meaningful server-side paper lifecycle and governed research code, but provider-, database-, deployment-, and browser-level operation was not verified in this session. Paper profitability is **not proven**.

## 1. Executive summary

The audited codebase is TypeScript/React/Vite with a Fastify backend and Supabase/PostgreSQL persistence. The intended production path is provider candles → closed-candle selection and planner → persisted paper plan → independent entry gate → later-candle paper order/fill → position manager → account update and append-only ledger → account reporting. A separate research route collects immutable forward candles and evaluates a registered experiment.

One concrete risk defect was fixed: `LOSS_STREAK_LIMIT` and `LOSS_STREAK_COOLDOWN_BARS` had configuration entries but no consumer in the stored-plan entry authorization path. The shared risk module now derives the current streak from closed positions and realized paper trades, uses the trigger timeframe and latest closed bar’s close time, and denies both order creation and later fills during the configured cooldown. Unit and paper-service regression tests exercise the limit and a loss-to-denial lifecycle. No risk threshold was reduced and no migration was needed.

A follow-up safety pass fixed the pause bypass: an account safety pause blocks new plans and entries for the full cycle, manual runs reject paused accounts, and disabled accounts do not request planner/entry data. The scheduler continues management-only operation when global entries are disabled, and a forward migration includes disabled accounts with open positions in its service-only worker list. Worker health now checks cycle recency, autopilot health degrades if an enabled account is paused, and the admin view distinguishes worker availability from entry authorization.

The implementation remains incomplete against the request. The production planner supports bullish spot-long setups only; the calendar/news provider adapters are unconfigured; worker coordination is process-local; SQL/RLS/concurrency behavior and the actual provider-to-database worker were not exercised; research has no background collector; and the UI does not expose a complete experiment workflow or an evidence-backed reporting/export suite. The new SQL migration and its pgTAP test are source changes only and were not run. No live order path was introduced.

## 2. Actual architecture and data flow

- **Frontend:** React pages including Trader Desk, AI Learning, Backtesting Center, and admin health/metrics. Trader Desk consumes authenticated backend routes; browser-side Backtesting Center is explicitly exploratory and omits realistic execution costs.
- **Backend:** Fastify routes and middleware under `backend/src`. `backend/src/server.ts` starts the paper autopilot when schema health passes and the process is not in test mode. `AUTONOMOUS_TRADING` controls new entries; the worker continues management of existing positions while entries are disabled. API `/health` reports API liveness; it is not worker health.
- **Market data:** `backend/src/services/marketDataService.ts` resolves provider-specific mappings, calls configured Massive/Twelve Data adapters, normalizes and validates candles, uses bounded caching/quota controls, and identifies stale results/datasets. Adapters and candle contracts have unit coverage. Current credentials, provider entitlement, real data freshness, commodity calendar continuity, and provider revision behavior were not verified here.
- **Planning:** `backend/src/autonomy/paper-autopilot.ts` selects closed data across configured timeframe roles and calls `backend/src/trader/planner.ts`. Intended context is 1D/4H; setup 1H; primary trigger 15M; 5M is used for management. The available registered trend-pullback planner produces long-only plans; short plans are explicitly rejected by the spot paper account gate.
- **Execution/risk:** Closed trigger candles pass `advanceStoredTradePlans` and `advanceTradePlan`. The entry gate checks market availability, event blackout data, promotion/shadow status, reward/risk, position/exposure/frequency/loss/drawdown limits, fresh marks, and stop-based sizing. New orders cannot fill on their creation candle. Shadow mode is on by default and production entries require a database-validated promotion.
- **Position management:** `manageOpenPositions` delegates to the side-aware position manager for persisted rows, closed management candles, stop/target handling, costs, and time stops. Long plan falsification is observed from closed 4-hour candles after position open, persisted as `thesisInvalidatedAt`, and exits at the next eligible management-bar open; protective stops retain priority. Unit/replay/account tests cover this application behavior, but database crash recovery and provider-backed continuity remain unverified.
- **Persistence:** `paper_sim_accounts` plus version-checked `record_paper_account_update` are the account path; derived events project to the decision ledger. SQL migrations define locking/version checks, append-only protections, research immutability and service-only collection writes. Migration `20261022000000_paper_autopilot_manage_open_positions_when_disabled.sql` keeps accounts with open positions visible to the worker after entry disablement. Deployed grants, RLS behavior, atomicity, and concurrency properties remain unverified here.
- **Research:** Authenticated backend routes register experiments and collect bounded immutable provider data. The documented replay requires a fixed future holdout, 90 days / 8,640 closed 15-minute crypto bars and at least 100 forward trades, includes cost assumptions and seeded baselines, and blocks non-crypto until sessions are verified. There is no background research collector; clients must continue collection within provider lookback limits.

## 3. Seven core capabilities

| Capability | Status | Assessment |
|---|---|---|
| Reliable, explainable market analysis | **Partial** | Real-provider adapter architecture, normalized candle validation, closed-candle selection, dataset identity, freshness and blocked paths exist. Real provider contracts/entitlements, clock/revision behavior, complete data-quality acceptance, and reproducible production snapshots were not verified. Metals must remain blocked until session-calendar continuity is verified. |
| Multi-timeframe reasoning | **Partial** | The 1D/4H → 1H → 15M chain exists in planner/autopilot code, with 5M management. The available plan path is bullish-only, and actual provider alignment, missing/stale/disagreement cases and no-lookahead behavior were not established in an end-to-end run. |
| Versioned strategies, setups, plans | **Partial** | Persisted structured plans include evidence, dataset, engine versions, invalidation, targets, expiry and state events; only a narrow trend-pullback setup is active in code and promotion-gated. Other strategy families are not implemented as verified strategies. Short setup coverage is absent. |
| Authoritative risk management | **Partial** | A server-side entry gate checks exposure, daily/weekly loss, drawdown, marks, sizing, reward/risk, limits and the newly enforced consecutive-loss cooldown. The account is spot long-only; sizing uses JS `number`, and authoritative tick/contract/conversion valuation plus a full decimal-safe risk model are absent. There is no verified concurrent database execution test. |
| Autonomous paper execution/lifecycle | **Partial** | Plan → pending → later candle fill → manager → paper account/ledger is implemented in code with idempotency/checkpoints and shadow mode. Position thesis invalidation now persists closed 4-hour breach time and exits on the next management bar. Entry pause no longer prevents management of disabled-account open positions (migration/test added); DB restart/recovery, concurrency, worker topology, catch-up safety and whole-path runtime behavior are unverified. |
| Research and controlled improvement | **Partial** | Immutable collection, holdout overlap governance, chronological replay, costed baselines and promotion gates are present in code/migrations/docs. SQL tests and a forward collection/promotion run are unverified; there is no background collector or complete operator workbench. |
| Performance/evidence reporting | **Partial** | Account-level positions, trades, costs and reconciliation paths exist. Ledger-derived exports, comprehensive categorized reports, sample-size/caveat presentation and aggregate reconciliation have not been verified as a complete operator reporting capability. Legacy admin KPI table has no identified in-repository writer. |

## 4. Additional capabilities

| Capability | Status | Evidence and remaining work |
|---|---|---|
| Decision journal and explainability | **Partial** | Plan events, journal records, datasets, config hashes and decision-ledger events exist. Persisted long-plan invalidation events are now represented in position management; full trace correlation/decision coverage was not verified. |
| Security and authorization | **Partial** | Fastify bearer auth, current-role checks, admin route guards, rate limits, Helmet/CORS controls, service-only RPCs and multiple RLS/immutability migrations exist. Database effective grants/RLS and production configuration were not inspected; admin MFA is optional by default in checked-in configuration. Direct-write historical grants and profile role-update paths need deployed grant and policy verification. No security certification is claimed. |
| Database correctness | **Partial** | Versioned migrations, account CAS RPC and append-only/research controls are present; added a forward worker-list migration plus a pgTAP contract. The repository has 46 unique migration versions, but production migration history, constraints, effective grants/RLS, transaction behavior and SQL test results are unknown. |
| Observability and recovery | **Partial** | Admin health aggregates schema, ledger, accounting, provider budgets, feeds, freshness, scheduler and autopilot diagnostics; stale cycle time and paused enrollment now degrade health, with worker enabled separated from entry enabled. Persistent heartbeat/lease, distributed coordination, recovery and alerting are not proven. |
| Frontend/operator experience | **Partial** | Trader Desk displays persisted paper account and autopilot data; research endpoints exist, but AI Learning is largely a listing, and exploratory browser backtest lacks costs. No complete research controls, verified result categories, frontend regression suite, or authenticated browser run was performed. |
| Configuration and deployment | **Partial** | Central trader settings are schema-parsed; `AUTONOMOUS_TRADING` defaults to false, requires literal `true`/`false`, and explicit account-run requests fail closed while disabled (these safety edits were already in the initial dirty worktree). Persistent worker deployment/topology and provider/database configuration remain operator-dependent. |

## 5. Files changed and rationale

### Functional edits made for this implementation

- `backend/src/trader/risk.ts` — added closed-position loss-streak calculation and an explanatory cooldown denial using canonical timeframe durations.
- `backend/src/trader/risk.test.ts` — covered cooldown activation/expiry, consecutive streak reset by a win, exclusion of open/partial positions, and future-dated records.
- `backend/src/services/paperTradingService.ts` — invoked the cooldown in the persisted server-side entry gate, which is re-evaluated for pending fills as well as new triggers.
- `backend/src/services/paperTradingService.test.ts` — covered opening and stopping a paper position, then denying a subsequent plan under the configured streak lockout.
- `backend/src/autonomy/paper-autopilot.ts` and `backend/src/autonomy/paper-autopilot.test.ts` — suppressed entries during global/account pause and missing required data; rejected paused manual runs.
- `backend/src/services/adminOverview.ts`, `backend/src/services/adminOverview.test.ts`, and `backend/src/routes/admin-overview.ts` — checked worker-cycle freshness and degraded health for paused enrollment.
- `backend/src/server.ts` — kept existing-position management active while global entry authorization is off.
- `src/lib/backend-api.ts` and `src/components/Admin/SystemHealth.tsx` — displayed worker enabled and entry authorization separately.
- `supabase/migrations/20261022000000_paper_autopilot_manage_open_positions_when_disabled.sql` and `supabase/tests/paper_autopilot_management.test.sql` — included disabled accounts with open positions in the worker list while excluding idle disabled accounts.
- `.env.example`, `docs/DB_APPLY.md`, `supabase/tests/README.md`, `docs/AUTONOMOUS_PAPER_TRADER_IMPLEMENTATION_PLAN.md` — corrected starting worktree inventory and appended the session's verified baseline, sequencing, risk change, and DB blockers. This file already existed as an untracked worktree file at session start.
- `docs/AUTONOMOUS_PAPER_TRADER_IMPLEMENTATION_REPORT.md` — this evidence-based report.

### Pre-existing worktree changes preserved, not attributed to this implementation

At the start of this session, the worktree already had modifications to `backend/src/autonomy/paper-autopilot.test.ts`, `backend/src/autonomy/paper-autopilot.ts`, `backend/src/config.ts`, `backend/src/routes/admin-overview.ts`, `backend/src/routes/trader.ts`, `backend/src/server.ts`, `backend/src/services/adminOverview.ts`, `docs/multi-timeframe-implementation-report.md`, `src/components/Admin/SystemHealth.tsx`, `src/lib/backend-api.ts`, and `vite.config.ts`; untracked files included `backend/src/config.test.ts`, `backend/src/services/adminOverview.test.ts`, and the plan document. These changes were preserved. Their behavior was not attributed to this session's functional implementation.

## 6. Migrations, constraints, RLS, and verification

No migration was applied. New forward-only migration `20261022000000_paper_autopilot_manage_open_positions_when_disabled.sql` updates the existing service-only `list_enabled_paper_autopilots()` RPC to include disabled accounts only while they have open positions. It retains the RPC's service-role-only execution grant; no table grants or RLS policies were changed. `supabase/tests/paper_autopilot_management.test.sql` covers open/idle/enabled selection and authenticated RPC denial. Existing repository SQL describes account CAS, append-only ledger controls, RLS ownership policies, immutable research artifacts, holdout overlap checks, and bounded collection writes.

Verification: `npm run check:migration-versions` passed (46 migration files, unique versions). `npm run test:research-holdout-concurrency` was blocked by `ECONNREFUSED 127.0.0.1:54322`. The environment execution policy denied `supabase test db`; it was not run. No disposable PostgreSQL instance or hosted Supabase project was available for effective grants/RLS inspection. Apply only pending migrations after checking production migration history and grants, following `docs/DB_APPLY.md`; do not reset or replay production data.

## 7. Security/RBAC changes

The risk lockout runs on the backend and derives its decision from server-loaded paper account records; callers cannot provide the streak count or bypass it through frontend checks. Existing bearer auth, route authorization, service-role RPC boundaries and account-level persistence remain unchanged. No auth model or role permissions were altered. Production RLS/grants, optional admin MFA settings, and the historical direct-write/profile-role policy concerns described by the audit still require verification against the deployed database. No security certification is asserted.

## 8. Exact commands run and outcomes

| Command | Result |
|---|---|
| `git status --short; git rev-parse HEAD; node --version; npm --version` | PASS; revision `256dd3f1351bfc34d71ba562ab1597bf0aebac97`, Node `v24.15.0`, npm `11.12.1`; pre-existing dirty worktree documented above. |
| `npm run backend:typecheck` | PASS after edits. |
| `npm run typecheck` | PASS. |
| `npm run lint` | PASS. |
| `npm run build` | PASS; Vite built 1,615 modules. Existing `App` chunk warning remains (~922.55 kB). |
| `npm run check:env` | PASS; all 55 code-read variables documented. |
| `npm run check:migration-versions` | PASS before follow-up; 45 versions unique. Re-run after follow-up: PASS; 46 versions unique. |
| `npm ls --depth=0` | PASS; installed top-level dependency tree is resolvable. |
| `npx vitest run backend/src/trader/risk.test.ts --maxWorkers=1` | PASS; 13 tests. |
| `npx vitest run backend/src/services/paperTradingService.test.ts --maxWorkers=1` | PASS; 8 tests. |
| `npx vitest run backend/src/autonomy/paper-autopilot.test.ts backend/src/services/adminOverview.test.ts backend/src/routes/admin-overview.test.ts backend/src/trader/risk.test.ts backend/src/services/paperTradingService.test.ts --maxWorkers=1 --reporter=dot --silent` | PASS at the previous follow-up; 5 files / 39 tests. |
| `npm test -- --maxWorkers=4` and `npm test -- --maxWorkers=1 --reporter=dot --silent` | Invoked, but the tool returned truncated output without a final Vitest summary; aggregate suite status is **not claimed**. |
| `npm run test:research-holdout-concurrency` | BLOCKED; PostgreSQL connection refused at `127.0.0.1:54322`. |
| `supabase test db` | NOT RUN; execution policy denied the command. The new migration pgTAP test remains unverified. |
| Browser smoke test | NOT RUN; preview reported `Dev server is not ready`, and process-launch command was denied by execution policy. |
| `npx vitest run backend/src/trader/manager.test.ts backend/src/trader/replay.test.ts backend/src/services/paperTradingService.test.ts backend/src/autonomy/paper-autopilot.test.ts --maxWorkers=1 --reporter=dot --silent` | PASS in this continuation; 4 files / 34 tests, including persisted 4-hour invalidation timing, protective stop priority, replay, and duplicate-candle behavior. |\n| `npm run backend:typecheck` | PASS in this continuation after aligning replay call sites. |\n| `git diff --check` | PASS at the time run. |

A nonstandard `npx vitest run --maxWorkers=1 --reporter=basic` attempt failed because `basic` is not a built-in reporter. It did not run tests and is not counted as a test failure or pass.

## 9. Paper simulation assumptions and limitations

The repository describes an all-or-none, spot-long paper simulator. A pending stop entry only becomes eligible on a later candle; gapped stops use the candle open, otherwise the trigger level, then configured adverse slippage and fees. Position management uses closed bars and gives a touched stop precedence over an intrabar target when ordering is ambiguous. This is a deterministic OHLC bar model, not order-book execution; partial entry fills, queue position, funding/borrow, exchange outages and realistic thin-book impact are not modeled. The management helper can manage persisted shorts symmetrically, but the active planner and execution account do not support short openings. The scheduler continues management-only work for disabled accounts with open positions when management candles are available and fresh. It cannot safely advance stops or exits when required management data is unavailable; this state needs deployment observability and recovery verification.

No market-generated or synthetic fallback was introduced. Existing synthetic candles are test fixtures only. Results are simulation-only and not evidence of real execution quality.

## 10. Research methodology and evidence thresholds

Existing research documentation specifies chronological training and fixed future holdout registration, immutable candle lineage, 90 forward days, 8,640 closed 15-minute bars, at least 100 forward trades, at least 1,000 seeded random-entry baselines, buy-and-hold and holding-cash comparisons, fees/slippage, and fail-closed promotion. The implementation does not lower these thresholds. These are documented/code-path requirements, not evidence that collection, statistical evaluation, SQL governance, or promotion ran successfully in this environment. A failed/insufficient sample remains inconclusive; in-sample performance is not promotion evidence.

## 11. Deployment, configuration, and recovery

- Use a persistent trusted Node backend process for the scheduler; do not assume a serverless request process is a durable worker.
- Keep provider keys and Supabase service credentials server-side. Do not expose service credentials through Vite/public environment variables.
- Keep `AUTONOMOUS_TRADING=false` until production migration history/grants, schema readiness, ledger reconciliation, provider freshness, and deployment topology are checked. The setting defaults off and accepts only literal `true` or `false`; the worker may still run to manage existing open positions, while entries remain disabled.
- Apply only pending migrations in the documented order after backup and migration-history comparison. Follow `docs/DB_APPLY.md` and `docs/MIGRATIONS.md`; no production reset is appropriate.
- Current worker serialization is process-local; deploy at most one scheduler instance until a database lease/heartbeat and safe recovery behavior are implemented and tested for the actual topology.
- Check `/health` only for API liveness. Confirm authenticated/admin system health, schema state, ledger/accounting reconciliation, provider freshness, and the paper scheduler diagnostics separately before enabling the worker.
- Research collection currently requires repeated authenticated collection requests; there is no durable background collector. Commodity experiments remain blocked until provider-specific market sessions and calendar continuity are verifiable.
- Back up the database and confirm restoration procedures in the target Supabase/PostgreSQL environment before operational use. Restoration itself was not tested here.

## 12. Known risks and prioritized next steps

1. **P0 — database proof:** run migrations and SQL/pgtap/concurrency tests against disposable PostgreSQL/Supabase; verify effective table privileges, RLS policies, RPC grants, CAS behavior, and idempotency under concurrent writes. Resolve policy/runtime access first.
2. **P0 — worker safety:** add a persistent lease/heartbeat for the actual deployment topology; the current cycle-age health check is process-local. Prove restart recovery, non-overlapping jobs, management-only behavior during entry pause, and fail-safe behavior when management candles are unavailable.
3. **P0 — provider/calendar safety:** supply authorized provider credentials in a protected environment and verify contracts, quotas, source consistency, closed candle revisions and clock behavior. Keep XAUUSD/SilverUSD blocked until session/calendar continuity is known.
4. **P1 — complete lifecycle evidence:** run provider-to-plan-to-risk-to-fill-to-stop/target-to-ledger integration and crash/replay tests against disposable PostgreSQL; verify recovery and reconciliation.
5. **P1 — strategy coverage:** implement and independently test short plans, or clearly continue to expose the system as long-only; do not infer bearish capability from position-manager math. Keep unverified strategy families inactive.
6. **P1 — research:** add durable background collection, operator-visible stage/error states, isolated forward evidence, and live SQL holdout/promotion tests without changing thresholds.
7. **P1 — reports/UI:** make results ledger-derived and distinguish paper, forward and backtest; expose sample warnings, evidence lineage and blocked/degraded states; replace or identify the external writer for legacy `system_metrics`.
8. **P2 — precision and valuation:** move the risk/execution path to decimal-safe money arithmetic and documented instrument-specific tick/contract/conversion rules before adding markets with unknown valuation.
9. Re-run the complete test suite with an observable final summary, full SQL integration tests, security tests, authenticated browser workflows, and deployed worker checks. The UI build/typecheck passed, but no browser test was performed because the dev server was not ready and its launch command was blocked by environment policy.

## 13. Profitability statement

**Profitability is not proven.** Passing typechecks, unit tests, or a production build is not performance evidence. No provider-backed, independent out-of-sample, forward paper, or live execution results were measured or claimed.

## Requirement status table

| Requirement | Status | Evidence | Remaining blocker |
|---|---|---|---|
| Actual repository/commit/worktree audited | Implemented | Commit `256dd3f`; dirty starting files recorded in plan and report. | None for static audit; production state is separate. |
| Plan created before implementation and updated | Implemented | `docs/AUTONOMOUS_PAPER_TRADER_IMPLEMENTATION_PLAN.md`. | None. |
| Risk streak lockout enforced server-side | Implemented | Shared risk helper, stored account entry gate, risk and lifecycle tests pass. | Verify under PostgreSQL concurrent account writes. |
| Real provider closed candles in autonomous runtime | Partial | Provider adapters, candle validation and closed-candle code paths exist. | Provider credentials, contract/freshness runtime and end-to-end test. |
| Long and short planning | Missing | Spot long-only gate and bullish planner; short entry is rejected. | Implement and verify a short strategy or formally retain long-only scope. |
| Risk ceilings, sizing and kill switch | Partial | Multiple server risk gates and loss lockout; autopilot entry pause and manager-only worker behavior are implemented. | Decimal valuation, DB application/test for disabled-open-position discovery, complete restart proof, and concurrency. |
| Atomic/idempotent paper lifecycle | Partial | Versioned account RPC, checkpoint/idempotency paths, later-candle fill logic, and persisted 4-hour thesis invalidation; added migration and pgTAP test for management after entry disablement. | SQL test is blocked; DB restart, concurrent execution and end-to-end proof unavailable. |
| Worker lease and multi-instance safety | Missing | Process-local scheduler/account serialization only. | Deployment topology plus persistent lease/heartbeat implementation. |
| Research holdout and promotion | Partial | Versioned routes, immutable SQL design, thresholded forward replay. | Database tests and actual forward collection/promotion run. |
| Ledger-derived evidence reports | Partial | Paper journal, account, reconciliation and ledger paths. | Complete export/report verification and user-visible categories. |
| RBAC/RLS/deployed grants | Partial | Auth middleware, role checks, SQL policies/RPC restrictions. | Effective grants/policies and security regressions against disposable DB. |
| Operator UI and actual running state | Partial | Trader Desk/backend routes and admin diagnostics exist. | Authenticated browser validation, research workbench and deployment proof. |
| SQL integration/concurrency checks | Blocked | Concurrency script invoked and failed with `ECONNREFUSED`; `supabase test db` denied by policy. | Authorized local Supabase/PostgreSQL test environment. |
| Profitability | Not established | No independent forward paper evidence was collected. | Robust costed holdout/forward evidence at required sample sizes. |
| Live trading | Not implemented | Paper simulator and paper API only; no live broker path added. | Out of scope and prohibited for this task. |
