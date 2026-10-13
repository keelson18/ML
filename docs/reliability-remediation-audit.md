# Reliability remediation audit — Stage 0

**Audit date:** 2026-10-13  
**Starting revision:** `0dd94aa` (`main`, same as `origin/main`)  
**Starting worktree:** clean. This document records source inspection and commands run in this environment; it does not establish deployed database or provider state.

## System map and observed state flows

| Area | Current implementation and call path | Evidence / limits |
| --- | --- | --- |
| Web client | React/Vite pages call the Fastify API through `src/lib/backend-api.ts`; Vite proxies `/api/v1` and `/health`. | Browser behavior has not been smoke-tested in this audit. |
| API/auth | `backend/src/server.ts` registers Fastify routes, authentication, rate limits, health, schema readiness and scheduler lifecycle. Sensitive route tests exist. | Supabase JWT, deployed RLS and MFA policy are not live-verified. |
| Market data | `marketDataService.ts` resolves canonical registry symbols, calls Massive/Twelve Data, validates candle numeric/OHLC/order properties, coalesces requests, uses bounded cache/budget, and can serve flagged stale cache data after a provider error. Consumers must honor `stale` and closed-candle selection. | Provider entitlements, response semantics and live error behavior need credential-backed probes. |
| Decision/planning | `decisionService.ts` builds the master analysis result. Trader planning is separately run by `trader.ts`/`pipeline.ts` or `paper-autopilot.ts`; `createTradePlan` requires aligned bullish higher-timeframe context, then records a WATCHING plan. | The planner is currently narrower than the master engine and is long-only. Directional analysis itself does not open orders. |
| Trigger/execution | `advanceStoredTradePlans` requires a boundary-verified closed candle. `advanceTradePlan` requires a trigger and entry gate, creates a pending order; only a later candle can fill it. `simulatePaperOrder` creates the position. Entry gate checks market availability, event risk, grade/setup policy, RR, daily limits, concurrent/correlated exposure, loss/drawdown, and position sizing. | This is the scheduler's active path. There is also `executeDecision` in `paperTradingService.ts`; repository search found no production caller, only unit tests. It is a second, legacy direct execution implementation that needs a stage-3 disposition. |
| Position management | Scheduler/pipeline call `manageOpenPositions` on management candles; manager logic adjusts stops/exits; `reducePaperPosition` realizes cash/P&L/fees. Authenticated `POST /api/v1/paper/close` is a manual risk-reducing close endpoint. | The manual close fetches `1m` data and uses its last candle close without rejecting `series.stale` or checking candle closure/freshness. This is a confirmed market-data integrity gap for manual close price/provenance. |
| Persistence/accounting | `paper_sim_accounts.state` is the stored aggregate. In production, `updateAccount` submits a compare-and-swap version plus derived events to `record_paper_account_update`; SQL locks/versions and writes ledger events. Account reads are direct SELECTs. | Local test mode uses an in-memory map. SQL behavior, actual deployed grants and migration history have not been exercised against Supabase here. |
| Risk/account marks | `calculatePositionSize` sizes from equity/stop distance/cash/exposure. `markToMarket` calculates equity from cash plus open marked value. In the autopilot trigger gate, the current symbol is marked from the trigger close; other open positions are assigned entry price instead of fresh marks. | Confirmed fail-open valuation gap: unrelated open positions can have stale/unrealized P&L omitted from aggregate loss/drawdown decisions. The code has no “mark unavailable” result for those positions in this path. |
| Ledger | `ledgerEvents` derives plan/order/fill/exit/journal/review/gate events; SQL stores hash-chained events, snapshots and checkpoint metadata. Hash verification can be requested via health/admin routes. | Schema and SQL tests exist; no local Supabase CLI/database was established in this baseline. Hash chains do not stop a database owner who can rewrite the full chain. |
| Research/learning | `replayClosedCandles` is chronological, checks candle ordering/finite OHLC, and runs paper execution/manager logic with costs. `walkForward` returns chronological folds. Research routes persist user hypotheses and draft experiment metadata, not computed results. `evaluateSetupPromotion` evaluates caller-provided evidence. | No production caller of replay/promotion was found by repository search. Promotion evidence is not tied to a persisted immutable experiment/run; `triedSetupCount` and baseline summaries are supplied data. Therefore the repository does not currently prove reproducible out-of-sample promotion. |
| Scheduler | The paper autopilot loads enabled account settings through an RPC, processes candle series, and is configured from validated server settings. `server.ts` starts it only with `AUTONOMOUS_TRADING=true` and complete schema, and excludes `NODE_ENV=test`. | No multi-replica distributed lease was found; process-level locks do not prove one worker across replicas. Deployment topology is unknown. |
| Providers/timeframes | Shared market registry and timeframe maps drive the current two provider adapters; live feeds are in a separate `backend/src/live` tree with an import-boundary regression test. | Provider listing is not proof of instrument/timeframe entitlement. Must be reported as unverified absent probes. |

## Verified defect and risk register

| Severity | Finding | Reproduction / expected vs actual | Minimal planned remediation |
| --- | --- | --- | --- |
| P0 (risk control) | `markToMarket` silently substitutes entry price when a position mark is missing; active autopilot gate explicitly populates only the candidate symbol and entry-price fallbacks for the rest. | Inspect `backend/src/services/paperTradingService.ts` entry gate and `backend/src/trader/risk.ts`. A second open position with a material unrealized loss has no current mark in the snapshot, so aggregate equity/drawdown can be overstated. Expected: fail closed or fetch/validate all required marks. Actual: entry-price valuation. | Stage 1: make mark coverage explicit and reject new entries when any required open-position mark is absent, invalid, or stale; add tests for missing/invalid/stale marks and high confidence not bypassing rejection. |
| P1 (data integrity) | Manual paper close accepts a stale or forming `1m` candle as its exit mark. | `closeOpenPaperPosition` uses `(await fetchMarketData(...)).candles.at(-1)?.close`; it does not test `stale`, candle boundary or age. Expected: verified recent closed market price or explicit refusal. Actual: any last cached/provider candle can close. | Stage 2/6: require fresh, closed, provenance-bearing price for manual close and return a clear unavailable error; add boundary/stale tests. |
| P1 (research validity) | Promotion evaluates caller-supplied forward evidence but is not bound to immutable experiment provenance; no production promotion caller was found. | `evaluateSetupPromotion` accepts raw dates, trades, baseline expectancy, run count and tried-count as arguments; route stores draft metadata only. Expected: reproducible run result with chronological holdout and verified costs/sample lineage. Actual: standalone pure evaluator cannot verify claims in its input. | Stage 5/10: connect promotion to persisted, reproducible replay evidence, or keep promotion disabled until that proof exists; test leakage/underpowered/failed evidence. |
| P1 (execution consistency) | A second direct `executeDecision` path remains in `paperTradingService.ts` though production search found no caller. | `rg executeDecision` returns its definition and tests only. Expected: one authoritative execution boundary. Actual: independently maintained direct path and planner/executor path. | Stage 3: preserve compatibility only if a real supported caller is found; otherwise remove or make it structurally unavailable, retaining tests for blocked behavior as appropriate. |
| P1 (operational) | No deployment-wide scheduler lease is visible; account CAS protects state but not duplicate provider work/cycle scheduling across replicas. | Scheduler is constructed in-process; no lease/unique-cycle persistence found in inspected call paths. Expected: one owner per scheduled interval or database-backed lease. Actual: each configured server process can run its own scheduler. | Stage 8: verify intended deployment topology; add database lease/idempotent cycle identity if horizontal replicas are supported. |
| P2 (scope/claim accuracy) | UI backtesting and browser dashboard analytics remain separate calculations from the server paper plan/replay path. | Existing `docs/ARCHITECTURE_AUDIT.md` identifies `src/lib/backtest/engine.ts` and browser dashboard calculations; no production replay call was found. | Stage 9/12: label exploratory output accurately and prevent it being represented as validated server execution/research evidence. |
| P2 (provider provenance) | Dataset identifiers encode source/range/version metadata but do not prove raw response content identity or provider corrections. | Prior audit and current `MarketDataSeries` shape show `dataVersion` plus range, without a raw-data content digest. | Stage 10/11: add stable normalized-candle fingerprint and retain provider retrieval/provenance metadata where it can be done without storing secrets. |

No evidence of a real-money broker execution path was found in the inspected architecture or source searches. This is a repository-source conclusion, not a deployed runtime guarantee.

## Existing coverage and gaps

- Vitest coverage is present for candle clocks, market data, risk, planner, executor, account service, ledger calculations, API auth/routes, replay/research, scheduler and migrations.
- SQL test `supabase/tests/ledger_health.test.sql` documents transactional ledger tests and rollback. It requires a local Supabase database; two-session concurrency is explicitly not covered by that SQL test.
- The execution tests cover the planner/executor flow, but not the mark-coverage defect or manual-close stale/forming candle behavior.
- Research tests cover arithmetic and promotion thresholds, but use constructed evidence and do not demonstrate a persisted reproducible experiment workflow.
- No project `AGENTS.md` was found by `rg --files -g AGENTS.md`; README and architecture/security/database docs were inspected. The user-specified prompt path under `docs/` does not exist in this checkout; the complete Downloads attachment was used as the work order.

## Baseline checks (before implementation)

Environment: Windows PowerShell, Node dependencies already present; no install was run. Exact results:

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS, exit 0 |
| `npm run backend:typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, exit 0 |
| `npm test` | FAIL: 58 files, 320 passed / 1 failed of 321 tests. `backend/src/live/import-boundary.test.ts` exceeded its 5-second timeout during concurrent baseline runs. |
| `npx vitest run backend/src/live/import-boundary.test.ts` | PASS, 1 test, exit 0 when run alone. This indicates the full-suite failure is currently a contention-sensitive timeout; it still needs a serial full-suite rerun. |
| `npm run build` | FAIL before Vite config load: Node `spawn EPERM` from esbuild. No code-level build result established. |
| `npm run check:env` | PASS: all 52 application env reads documented. |
| `npm run check:migration-versions` | PASS: 41 files, unique versions. |
| `git diff --check` | PASS at baseline. |

Supabase CLI/database, hosted Supabase credentials, provider credentials and authenticated browser session were not available/used. Migration application, live provider behavior, live RLS/grants, and browser smoke checks are NOT-VERIFIED.

## Ordered implementation plan and Stage 0 gate

1. **Stage 1, risk P0:** remove silent mark fallback from approval calculations; require complete valid/fresh marks; validate every sizing input and risk boundary; test actual executor gate.
2. **Stage 2, data P0:** extend shared candle/provider quality checks as evidence requires; ensure manual close only uses a valid closed/fresh price; test forming/stale/missing provenance paths.
3. **Stage 3, execution P0:** audit all callers and lifecycle states; consolidate execution; test repeated/concurrent calls, risk-blocked plans, and persisted idempotency boundaries.
4. **Stage 4, accounting P0:** audit open/partial/close/retry accounting and ledger SQL; strengthen arithmetic/idempotency tests; run SQL integration only if a safe local DB is available (never hosted DB mutation).
5. **Stage 5, learning P0/P1:** ensure promotion cannot rely on unverifiable/in-sample/underpowered evidence; add chronological provenance/replay tests and keep promotion closed without verifiable evidence.
6. **Stage 6, paper realism:** verify costs, gaps, partial exits and displayed P&L against simulator behavior.
7. **Stage 7, security:** review auth, authorization, validation, RLS and secrets; run tests and source-level secret checks without reading `.env` values.
8. **Stage 8, scheduler:** analyze duplicate cycles, locks, retries and recovery; implement durable lease only if deployment support needs it and migration is forward-only.
9. **Stage 9, regime/confidence:** calibrate only from measured data; ensure scores do not bypass safety.
10. **Stage 10, reproducibility:** bind outcomes to dataset/config/engine versions and evidence provenance.
11. **Stage 11, instruments/providers:** reconcile advertised registry/timeframe support with adapter capabilities and fail closed for unverified combinations.
12. **Stage 12, UI/observability:** align shown states with API truth, clearly label uncertainty/errors.
13. **Stage 13, performance:** bound resource usage and measure any claims.
14. **Stage 14, regression/deployment:** run all feasible checks serially, validate migration version/schema scripts and produce deployment instructions.

**Stage 0 exit gate:** system map, risk register, baseline results and staged plan are recorded above. Proceeding to Stage 1 is appropriate; no credential-dependent or destructive operation is required for source-level fixes.

## Stage 1 report — independent risk gate

**Status:** implemented for the active autopilot entry gate; local unit/type/lint verification passed.  
**Root cause:** `markToMarket` substituted an open position's entry price when no mark was supplied, and the autopilot supplied entry prices for all other open symbols. A portfolio loss could therefore be absent from risk/equity calculations. Position sizing also accepted negative or non-finite exposure/cash inputs and allowed a stop above a long entry because it used absolute stop distance.

**Files changed:**

- `backend/src/trader/risk.ts` — exposes `missingMarkSymbols`; rejects non-finite/negative sizing inputs and non-long stop direction.
- `backend/src/services/paperTradingService.ts` — obtains other open-position marks from fresh, boundary-verified closed 1m candles; missing marks cause the entry gate to reject.
- `backend/src/trader/risk.test.ts` — adds malformed sizing, wrong-side stop and incomplete mark coverage regressions.
- `docs/reliability-remediation-audit.md` — records this stage and its evidence.

**Checks run:** `npx vitest run backend/src/trader/risk.test.ts backend/src/services/paperTradingService.test.ts` — PASS (2 files, 20 tests); `npm run backend:typecheck` — PASS; `npm run lint -- backend/src/trader/risk.ts backend/src/trader/risk.test.ts backend/src/services/paperTradingService.ts` — PASS.

**Blocked / remaining:** no real provider or Supabase integration was available, so live mark freshness and transaction behavior remain NOT-VERIFIED. The legacy `executeDecision` path is slated for the Stage 3 caller audit. The shared function retains entry-price display fallback but risk consumers can identify and must reject missing marks; browser/admin views that display fallback valuations will be addressed in Stage 12.

## Stage 2 report — market-data integrity on manual close

**Status:** manual close now requires a fresh, non-stale, boundary-verified closed 1m candle and a bounded age; regression coverage passes.  
**Root cause:** the close path previously used the final candle in the returned series without consulting the series stale flag or the shared close-boundary clock. It could therefore realize P&L using stale cached data or a forming bar.

**Files changed:** `backend/src/services/paperTradingService.ts` adds a shared `freshestClosedCandle` check used for both portfolio marks and manual close; `backend/src/services/paperTradingService.test.ts` verifies stale and forming data cannot close an open position; this audit records results.

**Checks:** `npx vitest run backend/src/services/paperTradingService.test.ts backend/src/trader/risk.test.ts` — PASS (2 files, 22 tests); `npm run backend:typecheck` — PASS.

**Remaining risks:** retrieval time, provider identity and quote semantics still depend on the current `MarketDataSeries` contract and provider validation. No provider was probed live. Management exits are driven by scheduled closed candles; their end-to-end provider freshness is part of the subsequent market-data audit.

## Stage 3 report — decision/execution consistency and duplicate prevention

**Status:** the uncalled legacy direct decision executor was removed. The only backend opening path is stored plan → closed-candle trigger → entry gate → pending order → later-candle fill → paper simulator → versioned account update. A retry regression verifies the processed-candle checkpoint prevents a second fill.

**Root cause:** `TradeDecision` explicitly encodes setup as `not_evaluated`, entry as `not_confirmed`, and final action as `NO_TRADE`. The legacy `executeDecision` ignored those states and consumed a caller-provided directional enum/levels to create a position directly. Repository-wide production search found no callers beyond the function itself; only tests invoked it.

**Files changed:** `backend/src/services/paperTradingService.ts` removes the bypass; `backend/src/services/paperTradingService.test.ts` removes tests that exercised that unsupported path, asserts retry idempotency on the actual plan/executor path, and exercises the Stage 2 close gates. The executor and planner were inspected and remain unchanged.

**Checks:** `npx vitest run backend/src/services/paperTradingService.test.ts backend/src/trader/executor.test.ts backend/src/trader/planner.test.ts` — PASS (3 files, 12 tests); `npm run backend:typecheck` — PASS; `npm run lint` — PASS.

**Remaining risks:** SQL account updates use per-account advisory locks, optimistic version checks and idempotent event keys, but the database integration suite and overlapping two-session race test were not run because local Supabase is unavailable. The frontend `src/lib/application/paper-trading-service.ts` is an isolated legacy helper with no production imports; its persistence endpoints are not registered in Fastify. It cannot be reached from the current app flow, but should be retired or aligned with canonical server persistence in the final regression/deployment stage if reference analysis confirms no external consumer.

## Stage 4 report — account and ledger integrity

**Status:** source-level accounting transition regression coverage expanded; current account/ledger design reviewed. No SQL changes were indicated by the confirmed defects in this stage.  
**Root cause / verification:** `reconcilePaperAccount` checks the configured starting-equity identity against cash, open book value, realized P&L and remaining entry fees. The simulator allocates entry fees proportionally on partial reductions. Tests now exercise wins/losses with entry and exit fees, partial exits, duplicate close rejection, deliberate account-state corruption, and the existing 1,000-trade reconciliation loop. SQL account updates serialize on an account advisory lock, compare versions, append events/snapshots and update account JSON inside the same RPC transaction. The append-only ledger has update/delete and statement-level TRUNCATE protections and idempotency keys.

**Files changed:** `backend/src/trader/decision-ledger.test.ts` adds profitable/losing, partial-fill and corrupted-state cases; this report records the Stage 4 inspection. No accounting implementation bug reproduced after using the configured starting-equity fixture.

**Checks:** `npx vitest run backend/src/trader/decision-ledger.test.ts backend/src/services/paperTradingService.test.ts` — PASS (2 files, 9 tests); `npx vitest run backend/src/trader/decision-ledger.test.ts` — PASS (1 file, 6 tests); `npm run backend:typecheck` — PASS; `npm run lint` — PASS.

**Blocked / NOT-VERIFIED:** `supabase`, `psql` and `docker` CLIs are not installed/available, so `supabase test db`, real PostgreSQL trigger behavior, migration application, two-session contention, and deployed grants were not verified. No hosted database was contacted. Existing SQL regression coverage is present in `supabase/tests/ledger_health.test.sql`.

## Stage 5 report — research and promotion validity

**Finding:** chronological replay (`replayClosedCandles`) and chronological folds (`walkForward`) exist and replay includes configured fees/slippage, but there is no production call site connecting replay outputs to an immutable experiment run or strategy promotion. `/api/v1/research/experiments` persists only a user-owned draft and parameters; it does not execute data selection, replay, holdout validation or promotion. `evaluateSetupPromotion` evaluates caller-supplied summary fields and its unit tests use constructed evidence, not persisted runs. The environment setting `PROMOTED_SETUP_TYPES` can be manually changed without a persisted evidence link. No learned promotion is currently wired to planner decisions, but the repository does not prove reproducible effectiveness.

**Status:** no fabricated experiment results or automatic promotion were introduced. I am retaining fail-closed defaults (shadow mode enabled and no promoted setup type by default); evidence-dependent promotion remains NOT-VERIFIED and is a release blocker for claiming the learning loop is effective. Required future work is an immutable run manifest, canonical candle digest, chronological untouched holdout and costed replay, plus server-owned promotion authorization bound to that run. The current evaluator alone is not proof of those controls.

**Checks:** Stage 4 testing above plus targeted research/replay tests are scheduled in the broader final verification; no test here claims a real experiment.

## Stage 6 report — paper execution assumptions

**Status:** simulator behavior is now documented in `docs/RESEARCH.md`, including spot-long scope, next-candle all-or-none entry, gap pricing, adverse slippage/fees, stop-first intrabar management, proportional fee allocation on reductions, and the manual-close freshness requirement. Existing and added accounting/executor tests cover deterministic fills, gap behavior, rejected gates and partial exits. These assumptions do not establish realistic exchange fills.

## Stage 7 report — authentication and API security

**Status:** source inspection found Fastify guards verify Supabase user tokens server-side, admin guards check profile role and assurance when MFA is required or enrolled, user-owned routes use authenticated identity, learning input is strict/bounded and rejects sensitive keys, secrets are isolated to backend/Edge Function env reads, and sensitive endpoints are rate-limited. No confirmed P0 bypass was found in the inspected routes. RLS and admin MFA policy remain database/deployment dependent.

**Checks:** `npx vitest run backend/src/middleware/fastify-auth.test.ts backend/src/routes/learning-research.test.ts backend/src/routes/paper.test.ts backend/src/server.test.ts src/lib/vite-env-safety.test.ts` — PASS (4 files, 22 tests; Vitest did not report the frontend env safety test in that invocation, so it is NOT-VERIFIED by that command). Existing route tests cover unauthenticated protected paths and malformed/disabled execution. A source scan for service-key references found them only in backend server config, `.env.example` names/placeholders, and server-side Edge Function env reads; `.env` values were not opened or printed.

**Remaining risks:** no live RLS allow/deny tests, privileged-key bundle artifact inspection, Supabase MFA session or dependency audit was run against a deployed service. The sample `.env.example` keeps admin MFA flags false; deployment policy should require MFA for privileged operations.

## Stage 8 report — scheduler ordering and recovery

**Status:** existing `PaperAutopilotScheduler` already sorts provider requests management timeframe first, then trigger timeframes, then planner history; per-account processing executes management before planning/entries, provider spacing derives from validated quota configuration, and a same-process running promise/account queue prevents local overlap. I extracted request ordering into a named pure helper and added a regression test so this safety priority is explicit. Existing catch-up replay is chronological and bounded by configuration.

**Files changed:** `backend/src/autonomy/paper-autopilot.ts` and `.test.ts` make the management → trigger → planner order directly testable; `docs/RESEARCH.md` records simulator semantics.

**Checks:** `npx vitest run backend/src/engines/confidence-engine.test.ts backend/src/autonomy/paper-autopilot.test.ts` — PASS (2 files, 8 tests); backend typecheck and lint are part of final rerun.

**Remaining risks:** scheduler ownership is process-local; no distributed lease/cycle claim exists. Multiple server replicas could repeat provider work (account CAS/checkpoints should constrain duplicate state changes, but this was not verified with concurrent database sessions). No production topology was supplied, so adding a lease migration without evidence of multi-replica scheduling is deferred. Timings are not claimed without a provider-backed cycle.

## Stage 9 report — regime/confidence behavior

**Finding and fix:** `confidence-engine.ts` previously used an uncalibrated raw `modelProbability` as the model-calibration factor while its explanation said uncalibrated evidence was neutralized. This made a high uncalibrated score inflate aggregate confidence. The factor is now neutral (0.5) unless calibration is attested; hard risk rejection still forces overall confidence to zero.

**Files changed:** `backend/src/engines/confidence-engine.ts` and new `backend/src/engines/confidence-engine.test.ts`.

**Checks:** `npx vitest run backend/src/engines/confidence-engine.test.ts backend/src/autonomy/paper-autopilot.test.ts` — PASS (2 files, 8 tests). The regression verifies 0.99 uncalibrated probability contributes a neutral factor and a calibrated high score cannot override a rejected risk gate.

## Stage 10 report — reproducibility and provenance

**Status:** market-data `dataVersion` now includes a SHA-256 digest of the normalized candle contents, and limited/coalesced series recalculate the digest for the returned candle slice. Dataset identity therefore changes when a provider corrects OHLCV while keeping symbol, timeframe and time range constant. A regression test reproduces that case.

**Files changed:** `backend/src/services/marketDataService.ts` and `.test.ts`.

**Checks:** `npx vitest run backend/src/services/marketDataService.test.ts` — PASS (1 file, 15 tests); `npm run backend:typecheck` — PASS; `npm run lint` — PASS.

**Remaining risks:** provider name, request time, entitlement/latency status and normalization version are recorded, but raw provider payloads are not archived. Replay/promotion still has no durable experiment-run manifest that binds a candle digest to strategy/config/risk/assumptions; Stage 5 learning validity remains NOT-VERIFIED.

## Stage 11 report — instrument/timeframe/provider consistency

**Status:** source mapping uses canonical market registry symbols and explicit provider adapters. Unknown/unmapped symbols fail before provider calls; Twelve Data and Massive response identity checks have existing tests; USD quote and provider availability are checked before autopilot entries. Shared timeframe maps define both supported adapters.

**Remaining risks:** registry presence and adapter mapping do not prove plan entitlement, actual market availability, realtime/delayed status, historical depth, or every provider/timeframe combination. No external provider keys were used for probes, so these operational facts are NOT-VERIFIED. The admin availability probe and runtime `available` gate remain required before enabling any symbol.

## Stage 12 report — frontend truth and operational observability

**Finding and fix:** `RiskManagement.tsx` used fixed limits (including 5% daily loss, 1.5 reward/risk and 2% heat coloring) that disagreed with server configuration, and recalculated exposure/drawdown from cost basis. `PortfolioPage.tsx` silently used entry price for missing marks and displayed zero unrealized P&L. The authenticated trader overview now returns server risk thresholds and gross exposure; Risk Management uses server metrics/settings. Portfolio uses canonical API candle data, only computes unrealized P&L from an available closed-candle mark, and hides paper equity while any position mark is unavailable. Stale symbols are shown as warnings.

**Files changed:** `backend/src/routes/trader.ts`, `src/lib/backend-api.ts`, `src/components/pages/RiskManagement.tsx`, `src/components/pages/PortfolioPage.tsx`.

**Checks:** `npm run typecheck` — PASS; `npm run backend:typecheck` — PASS; `npm run lint` — PASS.

**Remaining risk:** component/browser tests were not present for these pages; no authenticated browser session was used. Portfolio uses the API's explicit stale flag and verified closed-candle selector, but actual provider candle freshness remains dependent on backend/provider status.

## Stage 13 report — performance and bounded resources

**Inspection:** market-data cache is LRU-bounded by validated `MARKET_DATA_CACHE_MAX_ENTRIES`; candle requests are limited to 1,000; provider budgets bound wait/queue sizes; autopilot deduplicates symbol/timeframe fetches, applies quota-derived spacing, and bounds replay catch-up. No performance benchmark or real-provider workload can be measured without external provider credentials. I made no performance claim beyond these source-level bounds.

## Stage 14 report — final regression and deployment safety

**Status:** final serial suite and static checks pass; release/database verification remains incomplete.

**Final checks:** `npm test` — PASS (59 files, 330 tests); `npm run typecheck` — PASS; `npm run backend:typecheck` — PASS; `npm run lint` — PASS; `npm run build` — PASS (Vite warning: one 922.48 kB JS chunk, 186.42 kB gzip); `npm run check:env` — PASS (52 documented reads); `npm run check:migration-versions` — PASS (41 unique versions); `npx vitest run scripts/vite-env-safety.test.ts` — PASS (4 tests, elevated rerun after sandbox `spawn EPERM`); `git diff --check` — PASS.

**Blocked:** SQL database tests, migration application/history, deployed grants/RLS, provider probes, authenticated browser smoke test, scheduler multi-instance behavior and measured provider-cycle timing remain NOT-VERIFIED. No migration changes were made, and no hosted database was touched.

**Final readiness:** not ready for real-account autonomous paper-trading validation until owner-controlled schema/migration, ledger/accounting, provider availability/freshness, and scheduler ownership verification is complete. Local deterministic paper-flow tests pass. Research effectiveness and promotion remain unverified.
