# Multi-timeframe implementation report

**Date:** 2026-10-13  
**Starting revision:** `68442132464aff2c74c5656f76243f7f904cdfab` (`main`, clean worktree)  
**Final revision:** same commit; changes are present in the local worktree and are not committed.  
**Scope:** source implementation, local automated checks, and source-level security/data-flow review. No hosted database or live provider was contacted.

## 1. Executive verdict

The planner now has an explicit 1D/4H context → closed 1H setup → closed 15M trigger flow. The paper simulator remains spot-long only. Position management now applies side-aware math when loading persisted short positions, without enabling short entries. Provider candles receive additional future-time and fixed-interval alignment checks. Local type checks, lint, unit tests, and production build passed.

This does **not** establish trading effectiveness or readiness for further account-backed paper-trading validation. The current research endpoint cannot collect the required 90-day 15-minute holdout because its request limit is 1,000 bars. SQL migrations, RLS/grants, overlap locking, account concurrency, and end-to-end paper persistence were not run against PostgreSQL. Provider mappings and data freshness were not tested with authorized provider credentials. Deployment topology is still unknown.

## 2. Architecture changes and root causes

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

There is a concrete operational blocker: the research route now only accepts 15m, requires 90 forward days, and requests at most 1,000 candles. Ninety days at 15m requires at least 8,640 bars before training context. The route rejects that request, so it cannot presently accumulate an eligible 15m run. `docs/RESEARCH.md` records this. Do not lower the evidence threshold or substitute 1h/4h trigger data to work around it. Implement bounded immutable chunk collection and continuous replay, test it against local PostgreSQL, and keep promotion disabled until it produces eligible evidence.

No strategy effectiveness, profitability, or successful promotion was demonstrated.

## 7. Test matrix

| Command | Result | Evidence / limit |
|---|---|---|
| `npm ci` | PASS (baseline) | Installed 383 packages after sandbox EPERM required approved outside-sandbox retry; npm reported 8 advisories (2 moderate, 6 high). No dependency changes made. |
| `npm run typecheck` | PASS | Final frontend TypeScript check. |
| `npm run backend:typecheck` | PASS | Final backend TypeScript check. |
| `npm run lint` | PASS | Final lint run. |
| `npm test` | PASS | 60 files, 351 tests. First run exposed an old misaligned provider fixture; corrected fixture and reran full suite successfully. |
| `npm run build` | PASS | 1,615 modules; Vite warns `App` chunk is 922.50 kB (>500 kB). |
| `npm run check:env` | PASS | All 54 referenced variables documented in `.env.example`. |
| `npm run check:migration-versions` | PASS | 44 migration files have unique versions. |
| `git diff --check` | PASS | No whitespace errors; Git reports CRLF-to-LF normalization warnings for two edited files. |
| `npm run test:research-holdout-concurrency` | NOT-VERIFIED | Fails connecting to `127.0.0.1:54322` (`ECONNREFUSED`). No local DB service is listening. |
| SQL migrations / pgTAP / RLS / grants / DB concurrency | NOT-VERIFIED | Supabase CLI, `psql`, Docker, and Podman are unavailable. No hosted database was contacted. |
| Authenticated browser / provider / paper lifecycle | NOT-VERIFIED | Provider credentials and running disposable DB/browser session were not exercised. |

## 8. Database migrations

No migration was added or applied in this work. The migration version checker passes for the existing 44 files. Local SQL contract and concurrency tests cannot run because there is no local Supabase/PostgreSQL stack. The hosted database was not contacted, inspected, or modified.

## 9. Security review

Source paths continue to use authenticated routes, server-side provider fetches, owner-scoped experiment lookup, immutable run persistence, and a separate admin/MFA promotion path. The replay rejects mixed provider/timeframe inputs. Existing authenticated request schemas do not accept caller candles for decision analysis. This work did not change auth/RBAC or promotion authorization. Database-level grants, triggers, owner policies, concurrent holdout claims, and promotion behavior remain unverified until local SQL tests execute.

## 10. Changed files

- `.env.example` — document configurable 1H setup stage and setup expiry.
- `backend/src/autonomy/paper-autopilot.ts`, `backend/src/autonomy/pipeline.ts`, `backend/src/autonomy/scheduler.ts` — fetch, schedule, and pass 1H setup bars; create new plans only on 15M trigger.
- `backend/src/routes/trader.ts` — refresh route fetches closed 1H setup and 15M trigger series.
- `backend/src/routes/learning-research.ts`, `backend/src/routes/learning-research.test.ts` — research request requires 15M and includes 1H setup data.
- `backend/src/trader/config.ts`, `backend/src/trader/config.test.ts`, `backend/src/trader/types.ts` — setup timeframe/expiry configuration and planner contract.
- `backend/src/trader/planner.ts`, `backend/src/trader/planner.test.ts` — explicit 1H setup and 15M confirmation flow plus regression coverage.
- `backend/src/trader/research-run.ts`, `backend/src/trader/research-run.test.ts` — setup series in chronological replay; reject mixed providers and duplicate timeframe inputs.
- `backend/src/trader/manager.ts`, `backend/src/trader/manager.test.ts`, `backend/src/services/paperTradingService.ts` — side-aware position handling, short swing-high input, regression tests.
- `backend/src/services/marketDataService.ts`, `backend/src/services/marketDataService.test.ts`, `backend/src/services/marketDataBudget.test.ts` — future/alignment validation and interval-aligned fixtures.
- `src/components/pages/TraderDesk.tsx` — label the planner score as heuristic, not a percentage probability.
- `docs/RESEARCH.md` — document the 15m holdout/provider cap blocker.
- `docs/multi-timeframe-audit.md` — initial repository/call-flow audit, updated with implementation and verification results.
- `docs/multi-timeframe-implementation-report.md` — this report.

## 11. Remaining risks and exact next steps

1. Implement bounded immutable 15m holdout chunk collection with exact overlap/continuity checking and stable dataset lineage; test promotion remains blocked while evidence is incomplete.
2. Start a disposable local Supabase/PostgreSQL stack, apply migrations forward-only, then run pgTAP and concurrent overlapping holdout claim tests. Do not reset or contact the hosted database.
3. Add DB-level tests for RLS/grants, immutable results, promotion denial, duplicate paper cycles, account reconciliation, and concurrent account writes.
4. Run an authenticated end-to-end paper lifecycle on a disposable account/provider fixture: valid closed setup → later 15m trigger → independent risk approval → later-candle simulated fill → management → ledger reconciliation. Preserve real provider data only; do not fabricate results.
5. Establish the actual scheduler deployment topology. Add durable ownership only if multiple backend instances can run it.
6. Verify active instrument/provider mappings and closed-candle freshness with authorized credentials, and verify authenticated Trader Desk and health UI behavior.

**Readiness:** suitable for continued local code review and unit-level paper-path development; **not yet ready for further account-backed paper-trading validation** until the database, provider, research accumulation, and end-to-end lifecycle gaps above are resolved.
