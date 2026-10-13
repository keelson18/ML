# Multi-timeframe trading audit

**Audit date:** 2026-10-13  
**Starting revision:** `68442132464aff2c74c5656f76243f7f904cdfab` on `main`  
**Initial worktree:** clean  
**Scope:** current TypeScript paths, configuration, market registry, tests and SQL/migration inventory. This is a local source/test audit; no provider-backed account, authenticated browser, or live Supabase schema was available.

## Executive verdict

The repository has a paper-only plan and execution subsystem alongside a separate single-timeframe decision-analysis API. It has closed-candle selection, provider-specific symbol mapping, plan lifecycle states, market-availability checks, independent risk gates, a service-only account/ledger RPC, immutable research results, and shadow mode. This work adds the missing 1D/4H context → 1H setup → 15M confirmation planner chain and side-aware management for persisted short positions. Only one bullish trend-pullback setup is implemented; entries remain long-only and the spot simulator rejects short opens. The code is more explicitly staged, but it is not validated as a professional or profitable trading system.

The position manager used long-side comparisons for persisted `sell` positions even though entry creation rejects shorts. Side-specific stop, target, initial-risk, break-even, trailing, and progress calculations now cover both sides; short entry remains disabled. The planner now separately evaluates closed 1H setup bars, 15M confirmation bars, and chronologically aligned 1D/4H context. Provider candle validation now rejects future and fixed-interval-misaligned timestamps. Unit tests cover these changes. SQL integration and real provider/account validation remain unavailable.

## Actual architecture and call flow

### Entry points

- React/Vite client; API calls in `src/lib/backend-api.ts`, `src/lib/analysis-api.ts`, and persistence modules.
- Fastify server in `backend/src/server.ts`; registers `/api/v1/decisions/analyze`, Trader Desk/paper routes, learning/research, health, and autopilot control.
- Provider ingestion in `backend/src/services/marketDataService.ts`; Massive and Twelve Data adapters normalize and validate candles, content-hash their OHLCV series, cache requests, and coalesce in-flight fetches.
- One single-timeframe decision path: `backend/src/routes/decisions.ts` → provider closed candles → `backend/src/services/decisionService.ts` → `masterDecisionEngine` and engine orchestrator. It returns analysis, not a paper order.
- Paper path: `PaperAutopilotScheduler` / `AutonomousPipeline` → `createTradePlan` → `storeTradePlan` → `advanceStoredTradePlans` / `advanceTradePlan` → independent event/market/risk/account checks → `simulatePaperOrder` → `manageOpenPositions` / `managePaperPosition` → `record_paper_account_update` with ledger events.
- Research path: `/api/v1/research/experiments` registers server-validated metadata; `/run` fetches provider candles on server and calls `runResearchReplay`, then stores immutable evidence via `record_research_run`. Promotion uses admin auth and `approve_research_strategy`, based on stored server evidence.

### Paper decision sequence (current implementation)

1. Autopilot fetches closed management (5m), trigger (15m), setup (1h), and context (4h/1d) series, prioritizing management and trigger requests.
2. When relevant timeframe boundaries are due, the planner analyzes 1D/4H structure/regime/indicators/liquidity, requires both biases to agree bullish, requires bullish 1H structure and a closed 1H pullback-zone test/reclaim, then waits for a 15M close above the 1H setup high. A plan records setup/trigger levels, engine version, expiry, and invalidation; it remains long-only with configured reward/risk gating.
3. The plan is stored inside paper account state; a plan event is derived on account update.
4. On later closed trigger candles, executor arms a plan after its zone is touched, checks trigger conditions and expiry, then asks the service risk callback. Pending orders cannot fill on their creation candle and are checked again before a later-candle fill.
5. Entry gate checks current market availability, active/promotion and setup configuration, grade, RR, daily limits, duplicate symbol, concurrent/correlated positions, daily/weekly stops, drawdown, current marks for other open positions, cash/exposure sizing and portfolio heat.
6. The spot simulator only opens BUY/long positions. SELL requests are rejected. Open positions are managed on 5m closed bars by the side-aware manager after the fix in this worktree; stop wins same-candle stop/target ambiguity.
7. Account changes are versioned and atomically stored with ledger events through `record_paper_account_update`. `reconcilePaperAccount` checks account accounting identity in TypeScript. Database-level behavior has not been run in this environment.

### Data and configured universe

- Trader defaults: `HTF_TIMEFRAMES=4h,1d`, `SETUP_TIMEFRAME=1h`, `TRIGGER_TIMEFRAMES=15m,1h` (1h retained for legacy plan processing; new planner setups require first trigger `15m`), and `MGMT_TIMEFRAME=5m`; setup expiry is configured with `SETUP_EXPIRY_BARS`. These are validated in `backend/src/trader/config.ts` and `.env.example`.
- The server's autonomy symbol default is `DEFAULT_SYMBOL`, defaulting to the first active registry instrument (currently BTCUSD); `.env.example` explicitly sets `AUTONOMY_SYMBOLS=BTCUSD`. The registry also includes BTCUSD, ETHUSD, XAUUSD and silver as XAGUSD. “SilverUSD” is not the canonical registry symbol. Active registry status and actual provider availability are different facts.
- Autopilot eligibility is narrower: `isAutopilotSymbol` currently admits only active USD crypto instruments on Massive whose availability status is `available`. This is not provider verification of XAUUSD/XAGUSD, and no market availability probe was run here.
- Trader Desk now labels planner quality as a heuristic score, not a percentage probability. Research currently accepts only 15m runs; provider-history limitations described below prevent a full 90-day holdout run.

## Strategy, direction and lifecycle coverage

- Registry setup types currently contain only `trend-pullback`.
- Planner hardcodes bullish-only bias agreement, support pullback levels, `side: 'long'`, and USD-ending symbol eligibility. It does not implement the setup families or short setup logic described by old product documents.
- Trigger vocabulary includes close-above/below, higher-low break and bullish/bearish engulfing; existence of variants does not make them a connected strategy.
- `simulatePaperOrder` rejects SELL/short opening. This is a safety restriction; do not report short entry as supported.
- Paper manager tests cover long stop-first exit, partial targets, break-even, trailing, MAE/MFE, time stop, and thesis invalidation. New work adds short-position manager calculations only for correctness of persisted sell positions; it does **not** enable short entries.
- Replay's default risk gate also explicitly rejects short plans.

## Data quality and timeframes

- Provider parsers verify Massive ticker/Twelve Data symbol identity, numeric/positive OHLC, finite time/volume, OHLC consistency, nonnegative volume and strictly increasing timestamps. Data is tagged with instrument, provider, timeframe and content hash.
- `selectClosedCandles` filters against timeframe duration and a configured close grace. It does not by itself check provider provenance.
- Provider validation now rejects future timestamps and fixed-interval UTC misalignment; multi-timeframe planner checks ensure each selected closed snapshot ends in chronological order (1D/4H no later than the setup, setup no later than trigger). Replay checks chronological input and now rejects mixed-provider or duplicate-timeframe series. Missing-bar continuity and real provider disagreement remain unverified; gaps are not currently synthesized. The production pipeline filters each series to closed candles before planning.
- No aggregation of higher timeframes is used in the paper planner: it requests separate provider bars. No provider disagreement or market-history continuity probe was available.

## Risk and position management

- Risk configuration is parsed at backend startup in `backend/src/trader/config.ts` (risk %, heat, exposure, trade counts, loss stops, drawdown, RR, fees/slippage, cooldown, and evidence thresholds).
- The paper service's entry gate is independent of planner signal and rejects missing marks; tests cover missing, zero and nonfinite marks in `backend/src/trader/risk.test.ts`. The service loads 1m marks for other open positions and blocks entry if marks are unavailable. Provider-backed freshness and multiple-position DB behavior remain unverified.
- `calculatePositionSize` currently implements spot-long stop geometry and account cash affordability. Short execution remains disabled.
- Confirmed manager defect at audit: `backend/src/trader/manager.ts` checked long-side candle/stop/target/risk/trailing logic for both `buy` and `sell`. Fixed with side-specific stop/gap fills, target triggers, absolute initial risk, short favorable excursion, fee-adjusted break-even, trailing using swing highs for shorts, and monotonic stop movement. Regression tests cover adverse gaps, stop priority, short targets, break-even/trailing and excursion direction. This does not authorize short entry.

## Persistence, governance and security

- App paper-account write path is `paperTradingService.updateAccount` → `record_paper_account_update`; source audit shows direct `paper_sim_accounts` writes confined to SQL RPC, with code paths otherwise reading/loading rows.
- Research evidence tables/RPCs are server-owned and promotion is admin/MFA protected. Migrations `20261018000000`–`20261020000000` include immutable runs, overlap-protected holdout claims and future immutable experiment registration.
- Request schemas reject caller-supplied candles on decision API. Auth middleware protects analysis, paper and admin endpoints. Service credentials remain server-side.
- No live Supabase comparison, SQL test run, RLS/grant verification, concurrent update test, or authenticated browser test was possible. Docker/Podman are not available in the environment, so do not infer hosted schema state from migration files.

## Baseline verification (before implementation)

- `npm ci`: sandbox **FAIL** (`EPERM` spawn/cleanup); elevated retry **PASS**, 383 packages installed, npm reported 8 advisories (2 moderate, 6 high). No audit fix applied.
- `npm run typecheck`: **PASS**.
- `npm run backend:typecheck`: **PASS**.
- `npm run lint`: **PASS**.
- `npm test`: **PASS**, 60 files / 342 tests.
- `npm run build`: sandbox **FAIL** (`spawn EPERM` from esbuild); elevated retry **PASS**, 1,615 modules, existing `App` bundle warning at 922.48 kB.
- Database/provider/browser integration: **NOT-VERIFIED**. Previous current workspace report records Supabase CLI failure because Docker/Podman is unavailable; no hosted DB was contacted.

## Implementation verification (after changes)

- `npm run typecheck`: **PASS**.
- `npm run backend:typecheck`: **PASS**.
- `npm run lint`: **PASS**.
- `npm test`: **PASS**, 60 files / 351 tests.
- `npm run build`: **PASS**, 1,615 modules; existing `App` chunk is 922.50 kB and Vite warns it exceeds 500 kB.
- `git diff --check`: rerun after the final documentation/test edits.
- `npm run test:research-holdout-concurrency`: **NOT-VERIFIED/blocked**, connection refused on local `127.0.0.1:54322`; no DB has been contacted or changed.
- 15m research run: **NOT-READY**. A 90-day holdout needs at least 8,640 15-minute bars before training context, while one request is capped at 1,000; endpoint rejects the impossible history request. No evidence or promotion is claimed.

## Prioritized implementation gaps

1. **P1 research accumulation:** make immutable 15m holdout evidence accumulate across bounded provider-history chunks; current 1,000-bar cap cannot satisfy the 90-day evidence rule. Keep promotion disabled until this is implemented and database-tested.
2. **P1 database verification:** execute migration/pgTAP, overlap claim concurrency, permissions, immutable result, promotion denial, account reconciliation, and duplicate-cycle tests against disposable local Supabase/Postgres.
3. **P1 full lifecycle verification:** closed provider candle → 1h setup → later 15m confirmation → risk approval → later-candle simulated fill → management → ledger reconciliation needs disposable DB and authorized provider credentials.
4. **P1 safety test breadth:** expand through supported execution path for stale/missing timeframes, unsupported markets, daily limits, retry/fill idempotency and independent checkpoints; unit evidence is not DB evidence.
5. **P1 deployment ownership:** repo locks are process-local; actual deployment topology is unknown. Add a durable lease only if the intended topology runs concurrent scheduler instances.
6. **P2 decision/UI provenance:** manual analysis remains a separate analysis-only route; verify authenticated UI behavior and show clear reasons/statuses across all pages.

## Current blockers

- No confirmed deployment topology.
- No disposable PostgreSQL/Supabase stack (Docker and Podman absent); cannot run pgTAP, migration execution, RLS/grants, DB concurrency, or the real persisted account lifecycle.
- No authenticated browser/provider probe in this audit; instrument entitlement, actual USD market mapping/history/freshness, and paper fill against account state are unverified.
