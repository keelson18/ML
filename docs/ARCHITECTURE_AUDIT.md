# Full trading platform audit

**Audit date:** 2026-10-12  
**Scope:** source tree, migrations, existing docs, and configured workflows. This is a source audit; no provider credentials, signed-in browser, or deployed Supabase project was available. The related implementation edits in this worktree are identified below. No real broker execution was found.

## Executive findings

| Priority | Finding | Evidence / impact |
| --- | --- | --- |
| P1 | Twelve Data bar timestamps can shift with the server timezone, and response instrument metadata is ignored. | `backend/src/services/marketDataService.ts` requests `timezone=UTC` but calls `Date.parse()` on a timezone-naive value; it also accepts values without checking response `meta.symbol`, `currency`, or `type`. This weakens candle alignment and quote provenance. |
| P1 | Public health exposes account-level reconciliation telemetry. | `/health` is unauthenticated and returns `paperLedger.accounting.accounts`, including deterministic account references and reconciliation differences, plus total account counts. Keep public health minimal; require admin auth for detailed ledger/account diagnostics. |
| P1 | The visible dashboard and backtest are separate calculations from the paper decision path. | `Dashboard.tsx` runs strategies and `combineSignals` in the browser. `BacktestingCenter.tsx` runs `src/lib/backtest/engine.ts`; it does not use the backend plan/replay simulator. Users can see different decisions/metrics from Trader Desk. |
| P1 | The UI backtest is not a realistic research result. | It uses fixed holding bars and capital-sized positions, omits fees, slippage, stop sizing, portfolio constraints, data lineage, and benchmark comparisons. Its Sharpe calculation annualizes per-trade returns as if they were daily. Do not present these results as validated strategy performance. |
| P1 | Research, ML, historical similarity, and knowledge are mostly optional engine inputs and are not populated by the live decision service. | `decisionService.ts` supplies candles and account risk/portfolio only. The research engine has no production call site in the master decision path. ML prediction can be supplied, but the service does not supply one. |
| P1 | ML retraining is not durable/reproducible and its chronological split is not purged for the five-candle label horizon. | `supabase/functions/ml-predict/index.ts` keeps `ModelState` in process memory; persisted `ml_predictions` are prediction rows, not fitted model weights. Adjacent labels near split boundaries can overlap the following split. The returned expected move is an accuracy-scaled heuristic, not a measured expected return. |
| P2 | Strategy attribution is misleading. | `strategy-engine.ts` chooses one heuristic `selectedStrategy` but computes signals from all live strategies and pattern detectors. `decision-engine.ts` explains BUY/SELL as coming from the selected strategy even when that strategy did not emit the signal. |
| P2 | Autopilot error text has a stale hardcoded global cap. | `autopilot_settings.max_symbols_global` is configurable, but `set_paper_autopilot` raises “Global autopilot symbol limit of 5 reached.” after checking the dynamic setting. Enforcement is dynamic; returned diagnostics can lie after settings change. |
| P2 | Existing audit/spec documents are stale or describe a different repository state. | Several older audits reference removed paths, claim broad integration/production readiness, or list a prior test pass. Use this report and current `docs/VERIFICATION.md` evidence; do not reuse old grades as current findings. |

## A. Existing architecture

The project has a React/Vite client, a Fastify API, shared TypeScript domain types and a static market registry, Supabase PostgreSQL/Edge Functions, and separate frontend, backend, and SQL migration areas. Provider keys are read by server code. Vite proxies `/api/v1` and `/health` to the configured backend target; `vite:only` therefore requires a separately running API. The combined dev script starts both services.

There are both client-side application/domain utilities and backend services. Some browser-only presentation calculations are useful for visualization, but the dashboard recommendation and browser backtester currently act as alternate decision/research paths.

## B. Master Decision Engine

`backend/src/engines/decision-engine.ts` is the canonical master engine. It calls market intelligence, risk, portfolio, contradictions, confidence, and AI reasoning. It calls ML, historical similarity, and knowledge only when callers pass those contexts. The result includes directional evidence, engine versions, confidence, and explanation.

BUY/SELL selection is based on the summed confidence of directional strategy/pattern signals plus hard data-quality, risk, portfolio, and contradiction gates. Optional ML, historical and knowledge evidence do not create a directional signal. Confidence does not independently veto a decision. `TradeDecision.supportingEvidence` contains directional strategy evidence, while the outer `EngineResult.evidence` contains broader supporting evidence; consumers that display only the inner decision lose context. AI reasoning summarizes evidence but does not choose the trade direction.

`backend/src/services/decisionService.ts` builds risk/portfolio context from paper account state. It fetches current marks for open positions, but does not load research, ML, historical cases, or approved knowledge. The present decision endpoint is analysis; `AutonomousPipeline` explicitly does not convert that BUY/SELL into a direct order. The separate Trader Desk plan/executor is the paper-entry path.

## C. Research and backtesting

`backend/src/engines/research-engine.ts` validates chronology, train/test indices, and cost inputs; it does not compute strategy performance. No production call site joins its output to the master decision engine.

The browser path in `src/lib/backtest/engine.ts` enters at the next bar open and exits after a fixed number of bars. It has no fee/slippage model, stop-based sizing, portfolio constraints, or source-dataset lineage. `walk-forward.ts` selects on win rate, uses no cost model, and has no explicit parameter-set validation. `monte-carlo.ts` uses `Math.random()` without an input seed and samples a normal distribution from historical mean/variance rather than resampling trade paths. These are exploratory utilities, not the documented production research protocol.

`backend/src/trader/replay.ts` is the stronger simulation path: it replays plans on closed candles, applies entry gates, fees/slippage, paper fills, exits, and provides cost sensitivity and generic chronological folds. It still needs a durable experiment manifest tying instrument/provider/dataset-content version, strategy version, parameters, risk policy, date range, and execution assumptions together. No same-period benchmark workflow is wired to the browser page.

## D. Strategy system

The shared strategy registry includes versioned detectors and metadata. Runtime strategy detection is restricted to a smaller hardcoded `LIVE_STRATEGY_IDS` list plus pattern detectors. Many `defaultParameters` describe values also hardcoded inside `detect`; changing metadata does not necessarily change behavior. Strategy spec mapping cannot be audited because the separately supplied strategy-library document is not in this repository.

The Trader Desk planner is independently narrower: a long-only `trend-pullback` setup using 1d/4h bias and a trigger timeframe. It requires a bullish bias and USD-ending symbol string, rather than a typed asset-class/trading-direction capability. The paper spot executor rejects non-long plans. The planner therefore does not implement general short/forex/index execution.

## E. ML and AI

The Edge Function engineers OHLCV features and fits logistic regression with a 70/15/15 chronological split. The function keeps trained weights in an isolate-local map and resets may trigger retraining; the database upsert stores predictions, not the fitted model. Five-candle forward labels are formed before the split without a purge/embargo, so labels near a boundary can consume prices from the next split. Reported accuracy/F1 are not enough to establish calibration or trading value. `expected_move_pct` is calculated from probability and accuracy with a fixed multiplier, not measured forward-return calibration.

The backend ML engine is a lineage/calibration evaluator, not a model trainer. The live decision service does not provide it with a prediction. The Kinetic Coach is a separate Gemini-backed assistant; news and coach content are not wired into trade signals in the audited decision path.

## F. Risk and portfolio

There are dedicated master risk/portfolio engines and a separate Trader Desk risk module. Trader configuration centralizes many limits, fees, slippage, sample thresholds, and timeframes. Account mark-to-market, stop-distance sizing, entry limits, and manager logic are in the paper workflow. Policy/version lineage is not complete across every execution/research surface. The frontend has its own risk calculation path and should not be treated as authoritative risk control.

The paper execution engine is simulation-only and has fees, slippage, target reductions, stop/invalidation/time-stop logic. The audited account is spot-long only. Intrabar stop-first ordering is a conservative assumption, not evidence of actual fill quality.

## G. Market intelligence

The single backend orchestrator composes data-quality, context, indicators, liquidity, patterns, regime, structure, and strategy engines. The engines return typed evidence. This is reusable architecture; it does not itself validate that underlying data is correctly sourced or that a signal has positive net expectancy.

## H. Data providers and live feed

| Path | Source symbol / behavior | Current audit conclusion |
| --- | --- | --- |
| Massive REST crypto | Registry uses `X:<BASE>USD`; aggregate OHLCV response milliseconds are converted to seconds. API key uses Authorization header. | Correct source format for REST. Entitlement and available history require a live account probe. Response ticker identity is not checked. |
| Twelve Data REST | `/time_series` with slash-form symbols; request asks for `timezone=UTC`; candles are reversed to chronological order. API key is a query parameter. | Provider `meta` is ignored; timezone-naive strings are parsed as host-local time. Credential may appear in URL-level telemetry. Entitlements remain unverified. |
| Coinbase live feed | Internal Massive USD crypto symbols map to Coinbase `<BASE>-USD` products. Tick feed is aggregated locally for display. | This is a different venue/source than Massive history. It should remain visibly source-tagged; no proof was found that these display ticks feed paper decisions. |
| Twelve Data live feed | WebSocket price subscriptions use registry symbol mapping; tick-only candle aggregator sets volume to null. | Realtime entitlement/latency not verified. It is not a substitute for validated historical candles or volume. |

Massive's [official Currencies format guidance](https://massive.com/knowledge-base/article/what-asset-classes-are-availalbe-through-massives-currencies-subscription) distinguishes REST `X:BTCUSD` from WebSocket `X:BTC-USD`; its [crypto custom-bars docs](https://massive.com/docs/rest/crypto/aggregates/custom-bars) describe UTC OHLCV bars. The code uses REST Massive for history and Coinbase for the crypto live stream; it does not currently use Massive's own WebSocket adapter. Twelve Data's [official API documentation](https://twelvedata.com/docs/mcp) describes time-series metadata (currency, exchange timezone, type) and datetime semantics; current normalization does not validate these fields. Current provider access, plan caps, historical depth, real-time status, and specific market coverage are **NOT-VERIFIED** without keys and probes.

## I. Canonical instrument audit

The registry has canonical symbol, base, quote, provider, source symbol, type, and activity fields, but `id`, `canonicalSymbol`, and `sourceSymbol` are optional in the shared `Market` type. The Massive BTC/USD and ETH/USD registry entries use `X:BTCUSD` and `X:ETHUSD`; XAU is assigned Twelve Data with `XAU/USD`, and XAG falls back to `XAG/USD`.

The earlier seed migration records BTCUSD/ETHUSD as USDT-sourced approximations. A later reseed migration replaces those active rows with Massive USD tickers and deactivates USDT assets. Runtime USDT-to-USD aliases have been removed in this worktree; lookup is now exact and unregistered quote symbols are rejected. The old focused market-data test was changed to assert rejection. Remaining generic engine fixtures use BTCUSDT as a test label and do not call the provider. Deployed migration state and historical candles/trades are **NOT-VERIFIED**.

Dataset identity includes registry instrument ID, canonical/source symbol, provider, base/quote, timeframe, range, and a static provider-format version. It does not fingerprint raw response contents or provider corrections. Same-range data revised by a provider can retain the same dataset ID.

## J. Data quality and candle lifecycle

Provider parsing checks numeric OHLCV, positive prices, candle high/low consistency, nonnegative volume, and strictly increasing timestamps. It does not verify provider-returned symbol/currency/type, timeframe alignment, timestamp timezone, or future timestamps. Empty gaps are accepted (normal for markets with no qualifying trades); no gap calendar is used to distinguish an expected quiet interval from missing data.

**Follow-up (2026-10-12):** Twelve Data naive timestamps are now interpreted as UTC, and provider response symbols are checked against the requested instrument. Massive response tickers are checked too. Empty successful provider responses now fail as unavailable instead of becoming successful empty datasets. Full currency/type metadata checks and timeframe/future-timestamp alignment validation remain open.

Autonomy selects closed candles and uses persistent account checkpoints. Account changes are version-checked in the `record_paper_account_update` RPC, and executor/manager mutations use account-state callbacks. Planner IDs are now deterministic by account/symbol/trigger timeframe/candle. The process-local lock/cache is not a distributed scheduler lease: multiple replicas may duplicate fetch and analysis work. One scheduler worker per project remains the documented operating assumption.

## K. Security, database, and migrations

Fastify authenticates user routes, rate-limits sensitive paths, validates request schemas, keeps service keys server-side, and has CORS/Helmet configuration. Migration `20261015000000_quantum_paper_core.sql` revokes direct paper-account writes, exposes a service-role account/ledger RPC, protects the append-only ledger with update/delete and statement-level truncate triggers, and uses admin+MFA checks for cap changes. Hash chains detect unauthorized changes only when the attacker cannot rewrite the whole chain; a database owner can rewrite/rebuild it.

Boot reads `verify_paper_schema`; incomplete schema prevents scheduler start, and trading/paper routes fail closed. Schema completeness and health behavior have not been tested against a deployed database. `scripts/verify-schema.sql` is an operator check, not a substitute for running it. Several historical migrations are semantic duplicates under different timestamps; do not apply blindly to an existing production project.

**Security finding:** unauthenticated `/health` returns schema inventory and `paperLedger`, including checked-account counts, hashed account references, and per-account accounting differences. `/api/v1/system/health` is authenticated but not admin-only. Restrict detailed diagnostics to authorized operators and return only liveness/readiness booleans publicly.

**Follow-up (2026-10-12):** fixed in the current worktree. Public `/health` now returns only process liveness and service identity. `/api/v1/system/health` is admin-gated, while Trader Desk uses `/api/v1/me/health`, which checks only the signed-in user’s paper account and ledger.

## L. Storage, ledger, and database map

`paper_sim_accounts` is authoritative account state. Application account mutations use `record_paper_account_update`; direct source-level account table uses found are reads and the SQL function's writes. Decision ledger stores events, periodic/trade snapshots, and hash chain; checkpoint-only state changes pass no event. Payload byte figures in `AUTOPILOT_BUDGET.md` are scripted JSON payload measurements, not PostgreSQL/WAL billing projections. Repetitive NO_TRADE compaction is recommended but not implemented.

The DB map marks `trade_plans`, `plan_events`, `paper_orders`, `trade_journal`, and `daily_reviews` planned/legacy while some UI reads attempt SQL first and merge account-JSON state. This dual model can confuse operators and should be clarified before dropping tables. `paper_accounts` is labeled dead but production usage must be checked before removal.

## M. Duplication and hardcoded assumptions

There is one master decision engine. There are multiple presentation/application and backtest calculations, but they are not the same decision pipeline. Autopilot caps are database-owned; an error string still embeds a cap of five. Risk and planner rules coexist in configuration and code; strategy default parameter metadata is not necessarily consumed by detector code. Market registry fields are optional even though data lineage depends on them.

## N. Test and CI evidence

Static migration version validation passes: 39 migration files, unique numeric prefixes. `git diff --check` passes. The source edits are unverified by TypeScript/lint/Vitest: `npm ci` failed with `EPERM` unlinking `node_modules/@esbuild/win32-x64/esbuild.exe`, and an elevated retry failed identically. The four commands then fail to launch because `tsc`, `eslint`, and `vitest` are unavailable. CI status for this worktree is **NOT-VERIFIED**. No live provider probe, SQL integration/RLS test, browser smoke test, or deployed scheduler run was performed.

## O. KEEP / REFACTOR / REPLACE / REMOVE / BUILD

| Decision | Components |
| --- | --- |
| KEEP | Master Decision Engine, market-intelligence orchestrator, typed evidence contracts, provider budget/cache, paper simulation lifecycle and event ledger |
| REFACTOR | Twelve Data timestamp/meta validation; public health output; UI recommendation authority; production backtest/experiment manifest; research-to-decision wiring; ML model persistence/split purge/calibration; required instrument identity fields; dynamic autopilot cap diagnostics |
| REPLACE | Do not replace an existing engine wholesale. Replace the browser fixed-hold backtest as the Trader Desk/Strategy Lab source of performance claims with the canonical backend replay/research workflow. |
| REMOVE | Quote-changing USDT-to-USD runtime alias (removed in current worktree); stale claims of production readiness in historical audit docs should be retired or marked historical. |
| BUILD | Credential-backed provider conformance/probe jobs, content-addressed datasets, a durable experiment registry, admin-only detailed health, and retention/compaction operations for repetitive NO_TRADE events |

## P. Recommended implementation sequence

1. Resolve provider correctness: timestamp parsing, response identity/currency checks, timeframe/future-bar validation, and error tests.
2. Sanitize public health; keep account-level ledger/reconciliation diagnostics admin-only.
3. Consolidate visible decision/backtest outputs around canonical backend outputs and label research limits accurately.
4. Persist experiment manifests and verified research evidence, then pass only eligible evidence into the existing master engine.
5. Persist/version ML weights, add purge/embargo at label-horizon split boundaries, and measure calibration/returns before using outputs.
6. Promote strategy parameters into effective configuration; verify supplied strategy spec separately without recreating it.
7. Run typecheck/lint/tests and schema/RLS/provider/browser verification in an environment with working dependencies and credentials.

## Changes made during this audit turn

Removed legacy symbol aliasing; changed the market data regression test to require rejection of BTCUSDT rather than requesting BTCUSD; corrected decision-context market type lookup and unregistered input rejection; made planner plan identity deterministic for a trigger candle and added focused tests. These edits are **NOT-VERIFIED** by the unavailable TypeScript/test tools. The new findings above are audit results, not implemented remediations.
