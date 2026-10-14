# Multi-timeframe implementation report

**Date:** 2026-10-14  
**Starting revision:** `000dab1225c1522b7d5bbbf971aeadc672e20715` (`main`, clean worktree)
**Final revision:** `256dd3f1351bfc34d71ba562ab1597bf0aebac97`; the verification worker-pool adjustment in `vite.config.ts` is uncommitted.
**Scope:** source implementation, local automated checks, and source-level security/data-flow review. No hosted database or live provider was contacted.

## 1. Executive verdict

The planner now has an explicit 1D/4H context → closed 1H setup → closed 15M trigger flow. The paper simulator remains spot-long only. Position management now applies side-aware math when loading persisted short positions, without enabling short entries. Provider candles receive additional future-time and fixed-interval alignment checks. Local type checks, lint, unit tests, and production build passed.

This does **not** establish trading effectiveness or readiness for further account-backed paper-trading validation. The former 1,000-bar research limitation is addressed in source by immutable incremental collection across bounded requests: the initial baseline must be saved before the registered holdout, later closed candles append to it, and replay waits for the full 90-day/8,640-bar 15m threshold. Collection only supports crypto until market-session calendars are verified; it has no background worker and must be polled before the 1,000-bar lookback is exceeded. A migration, pgTAP contract, and two-session concurrency harness were added, but none ran against PostgreSQL because Supabase CLI and a local database are unavailable. Provider mappings/freshness, end-to-end paper persistence, and independent hosted CI status remain unverified.

## 2. Architecture changes and root causes

### Verification reliability

The default Vitest run spawned one worker per test file (61 workers), causing a route test to exceed its unchanged five-second timeout under machine load. `vite.config.ts` now caps the worker pool at four. The full suite passes with this setting; no assertions or timeouts were weakened.

### Position management

`backend/src/trader/manager.ts` applied long-side stop/target comparisons, initial risk, break-even, trailing, and progress calculations to both `buy` and `sell` positions. Persisted short positions could therefore receive incorrect management decisions. Stop and target touches, gap fills, fee-adjusted break-even, favorable movement, progress, and monotonic trailing are now side-aware. `backend/src/services/paperTradingService.ts` passes both swing lows and swing highs to management. Regression tests cover short stop priority, adverse gaps, targets, break-even/trailing, and MAE/MFE direction. Short entries remain blocked by the existing simulator and risk path.

### Multi-timeframe plan flow

Previously `createTradePlan` used 1D/4H analysis but no 1H setup input, while 1H and 15M were both configured as trigger intervals. The planner now requires closed 1D/4H/1H/15M snapshots in chronological order. It requires bullish 1D/4H context, bullish 1H structure, a 1H pullback-zone test and reclaim, then a 15M close above the 1H setup high. Plan context records setup and trigger levels and a versioned 1H setup engine; setup expiry is configurable. Autonomy, manual Trader Desk refresh, scheduler timeframe registration, and research replay now fetch/pass the setup series. Legacy 1H trigger plans remain processable, while new setup creation is limited to the configured first trigger timeframe, 15M.

The setup is intentionally narrow and long-only. Its threshold and setup rules have unit coverage but have not been empirically validated. No strategy-performance claim is made.

### Candle integrity and research provenance

`backend/src/services/marketDataService.ts` now rejects future-dated and UTC-misaligned fixed-interval candles in addition to existing numeric/OHLC/order checks. Corresponding market-data tests were updated to provide aligned timestamps and cover future/misaligned/duplicate data. `backend/src/trader/research-run.ts` now rejects duplicate timeframe series and mixed providers, preventing a replay artifact from silently combining provider lineages.

### Explainability

Trader Desk previously displayed a heuristic planner quality score as a percentage. `src/components/pages/TraderDesk.tsx` now labels it “Heuristic score …/100”; it is not presented as a win probability.

## 3. Multi-timeframe flow

Verified from source call sites:

1. The autonomy pipeline and Trader Desk refresh request closed 1D and 4H context, 1H setup, 15M trigger, and 5M management data.
2. The planner checks that the newest closed context bars do not extend past the 1H setup, and that the 1H setup does not extend past the 15M trigger.
3. It derives context and levels from 1D/4H; requires a qualifying 1H pullback test/reclaim; then stores a plan whose trigger is a later 15M close above the setup high.
4. Stored plans are advanced by the existing executor. Risk approval remains independent of direction and is performed before the simulator accepts an order. Orders cannot fill on their creation candle; later closed candles are used for fill checks.
5. The simulator remains BUY/long only; open paper positions are managed with the revised side-aware manager, and account state is persisted through the existing RPC and ledger flow.

Automated tests exercise planner and manager behavior. This was not verified through a real provider → database → order → ledger lifecycle. The standalone manual-analysis endpoint remains analysis-only and is not itself proof of a confirmed setup or paper order.

## 4. Long/short correctness

The manager now applies short-side stop triggers on candle highs, short targets on candle lows, short adverse gap pricing, absolute initial risk, downward favorable movement, fee-adjusted break-even, and short trailing using swing highs. Same-candle stop/target ambiguity remains conservative: the stop is handled first. Unit tests pass for these cases.

Short entry, short sizing, and short lifecycle execution are still unsupported and remain blocked. No claim of complete long/short execution is made.

## 5. Data integrity and risk

- Provider parsing checks symbol identity, finite positive OHLC, nonnegative volume, OHLC relationships, increasing times, and content lineage; this work adds future-time and fixed-period boundary checks.
- Production planning selects closed candles and fails closed for missing snapshots or temporally misaligned timeframes. Separate timeframe gaps are not synthesized.
- The plan-based paper service keeps independent market availability, promotion/configuration, RR, daily limits, duplicate-symbol, position/concurrency, loss/drawdown, marks, sizing, cash, and heat gates. Existing risk tests cover missing/invalid marks.
- The planner's setup logic is heuristic. Its “quality score” is not calibrated, and UI now labels it accordingly.
- Real provider instrument availability, history continuity, stale response behavior, and account mark completeness were not probed.

## 6. Research validity

The server-side replay accepts provider snapshots, binds dataset identity to candle content and provider/timeframe, uses chronological split boundaries, includes configured fees/slippage, and compares with buy-and-hold and seeded random-entry baselines. It rejects mixed-provider and duplicate-timeframe inputs. Existing research governance freezes experiment parameters and requires future registered holdouts; promotion depends on stored server-generated evidence.

The route now accepts bounded collection batches and persists each candle once in `research_collection_candles` through service-only `append_research_collection_batch`. `research_collection_state` binds the owner, symbol, provider, continuity policy, and registered boundary. A pre-holdout baseline is required; future starts have a configurable `RESEARCH_COLLECTION_START_LEAD_MS` minimum. The SQL enforces closed/aligned OHLCV, immutable duplicate candles, exact continuity for 24/7 crypto, and a 20,000-candle per-experiment bound. Repeated requests return progress using SQL counts before loading the full dataset. After 90 days and 8,640 15m bars, the server stitches stored chunks with source-version lineage and runs the chronological replay. The owner must call the endpoint often enough to keep newly closed data within the provider's 1,000-bar lookback; missed crypto bars force a new experiment. There is no background collection worker. Non-crypto research is explicitly blocked until market-session calendars are verified. Unit tests include stitching a complete 8,640-bar holdout; SQL persistence/concurrency remains unverified, so no eligible experiment or promotion is claimed.

No strategy effectiveness, profitability, or successful promotion was demonstrated.

## 7. Test matrix

| Command | Result | Evidence / limit |
|---|---|---|
| `npm ci` | PASS (baseline) | Installed 383 packages after sandbox EPERM required approved outside-sandbox retry; npm reported 8 advisories (2 moderate, 6 high). No dependency changes made. |
| `npm run typecheck` | PASS (2026-10-14) | Frontend TypeScript check on the reviewed worktree. |
| `npm run backend:typecheck` | PASS (2026-10-14) | Backend TypeScript check on the reviewed worktree. |
| `npm run lint` | PASS (2026-10-14) | ESLint on the reviewed worktree. |
| `npm test` | PASS (2026-10-14) | 61 files, 360 tests with the four-worker config in the uncommitted worktree. Without the cap, the previous full run had one route-test timeout; that test passed alone. No assertions or timeouts were weakened. Includes a deterministic 8,640-bar/90-day collection stitching test. |
| `npm run build` | PASS (2026-10-14) | 1,615 modules; Vite warns `App` chunk is 922.50 kB (>500 kB). |
| `npm run check:env` | PASS | All 55 application variables are documented in `.env.example`. |
| `npm run check:migration-versions` | PASS | 45 migration files have unique versions. |
| `git diff --check` | PASS (2026-10-14) | No whitespace errors. |
| `node --check scripts/test-research-holdout-concurrency.mjs` | PASS | Concurrency harness parses; it was not able to connect to a database. |
| `npm run test:research-holdout-concurrency` | NOT-VERIFIED | Retried 2026-10-14; fails connecting to `127.0.0.1:54322` (`ECONNREFUSED`). No local DB service is listening. |
| `supabase test db` | BLOCKED | Retried 2026-10-14; `supabase` command not found. Docker, Podman, and `psql` are also unavailable. |
| SQL migrations / pgTAP / RLS / grants / DB concurrency | NOT-VERIFIED | No disposable PostgreSQL service is available. No hosted database was contacted. |
| Independent GitHub Actions status for `000dab1225c1522b7d5bbbf971aeadc672e20715` | NOT-VERIFIED | `gh` is unavailable and the unauthenticated commit page could not be fetched in this environment. Local checks were executed by this agent; they are not independent CI evidence. |
| Authenticated browser / provider / paper lifecycle | NOT-VERIFIED | Provider credentials and a running disposable DB/browser session were not exercised. |

## 8. Database migrations

Added `20261021000000_accumulate_research_holdout_candles.sql`, a forward-only migration. It has not been applied. The migration version checker passes for all 45 files. The new pgTAP contract and concurrency test could not run because Supabase CLI/PostgreSQL are unavailable and localhost `54322` refuses connections. The hosted database was not contacted, inspected, or modified.

## 9. Security review

Source paths continue to use authenticated routes, server-side provider fetches, owner-scoped experiment lookup, immutable run persistence, and a separate admin/MFA promotion path. The collection write RPC is service-role-only; both collection tables have RLS enabled and no direct client grants; collected candles have update/delete and truncate guards. The replay rejects mixed provider/timeframe inputs. Existing authenticated request schemas do not accept caller candles for decision analysis. This source review does not verify SQL execution, actual grants, triggers, or promotion behavior; run the added pgTAP contract locally.

## 10. Changed files

- `.env.example` — document configurable 1H setup stage and setup expiry.
- `backend/src/autonomy/paper-autopilot.ts`, `backend/src/autonomy/pipeline.ts`, `backend/src/autonomy/scheduler.ts` — fetch, schedule, and pass 1H setup bars; create new plans only on 15M trigger.
- `backend/src/routes/trader.ts` — refresh route fetches closed 1H setup and 15M trigger series.
- `backend/src/routes/learning-research.ts`, `backend/src/routes/learning-research.test.ts` — research request requires 15M and includes 1H setup data.
- `backend/src/trader/config.ts`, `backend/src/trader/config.test.ts`, `backend/src/trader/types.ts` — setup timeframe/expiry configuration and planner contract.
- `backend/src/trader/planner.ts`, `backend/src/trader/planner.test.ts` — explicit 1H setup and 15M confirmation flow plus regression coverage.
- `backend/src/trader/research-run.ts`, `backend/src/trader/research-run.test.ts` — setup series in chronological replay; reject mixed providers and duplicate timeframe inputs; avoid repeated planner creation on the same setup.
- `backend/src/trader/research-collection.ts`, `backend/src/trader/research-collection.test.ts` — stitch immutable collection rows, bind source lineage, calculate progress, and cover 90 days / 8,640 15m bars.
- `backend/src/routes/learning-research.ts`, `backend/src/routes/learning-research.test.ts` — bounded collection/SQL pagination, progress before replay, immutable completed-run retries, configurable start lead, and quote-currency handling for USD markets.
- `backend/src/config.ts`, `.env.example` — validated configurable holdout initialization lead time.
- `supabase/migrations/20261021000000_accumulate_research_holdout_candles.sql`, `supabase/tests/research_collection.test.sql` — bounded append-only storage, service-only batch RPC, schema health inventory, and pgTAP contract.
- `scripts/test-research-holdout-concurrency.mjs` — two-session collection append idempotency coverage alongside holdout overlap checks.
- `scripts/verify-schema.sql`, `docs/DB_APPLY.md`, `docs/DB_MAP.md`, `docs/MIGRATIONS.md`, `docs/RESEARCH.md`, `supabase/tests/README.md` — schema inventory, apply order, data map, operating limits, and test instructions.
- `backend/src/trader/manager.ts`, `backend/src/trader/manager.test.ts`, `backend/src/services/paperTradingService.ts` — side-aware position handling, short swing-high input, regression tests.
- `backend/src/services/marketDataService.ts`, `backend/src/services/marketDataService.test.ts`, `backend/src/services/marketDataBudget.test.ts` — future/alignment validation and interval-aligned fixtures.
- `src/components/pages/TraderDesk.tsx` — label the planner score as heuristic, not a percentage probability.
- `vite.config.ts` — cap Vitest at four workers after the unbounded 61-worker run caused a test timeout under load.
- `docs/RESEARCH.md` — document the 15m holdout/provider cap blocker.
- `docs/multi-timeframe-audit.md` — initial repository/call-flow audit, updated with implementation and verification results.
- `docs/multi-timeframe-implementation-report.md` — this report.

## 11. Remaining risks and exact next steps

1. Run `supabase start`, apply the new migration forward-only to a disposable local database, run `supabase test db`, and run `npm run test:research-holdout-concurrency`. Do not reset or contact the hosted database.
3. Add DB-level tests for RLS/grants, immutable results, promotion denial, duplicate paper cycles, account reconciliation, and concurrent account writes.
4. Run an authenticated end-to-end paper lifecycle on a disposable account/provider fixture: valid closed setup → later 15m trigger → independent risk approval → later-candle simulated fill → management → ledger reconciliation. Preserve real provider data only; do not fabricate results.
5. Establish the actual scheduler deployment topology. Add durable ownership only if multiple backend instances can run it.
6. Verify active instrument/provider mappings and closed-candle freshness with authorized credentials, and verify authenticated Trader Desk and health UI behavior.

**Readiness:** suitable for continued local code review and unit-level paper-path development. Research collection is implemented in source but **not operationally verified** until its migration and tests pass on local PostgreSQL. The system remains **not ready for account-backed paper-trading validation** until database, provider, and end-to-end lifecycle checks are complete.
