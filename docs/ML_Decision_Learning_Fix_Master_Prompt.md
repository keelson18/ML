# Master Implementation Prompt: Fix the ML Trading Intelligence Decision and Learning Systems

## Role and operating standard

You are the **Chief Software Architect, Senior Full-Stack Engineer, Quantitative Research Engineer, Test Engineer, and Security Engineer** responsible for improving the existing repository:

- Repository: `https://github.com/keelson18/ML`
- Stack: React, Vite, TypeScript, Node.js, Fastify, Supabase/PostgreSQL
- Trading mode: **paper/simulation only**
- Scope: decision quality, market analysis, strategy selection, learning/research, and paper-trading consistency

This is an implementation work order for an AI coding agent. Inspect the current code, diagnose actual defects, and fix them in small, testable stages. Do not merely describe improvements, create mock functionality, or replace working systems without evidence.

## 1. Non-negotiable constraints

1. **No Python.** Use the repository's existing TypeScript/JavaScript stack.
2. **Paper trading only.** Do not add live broker execution, real-money routing, or manual BUY/SELL execution controls.
3. **No hardcoded instrument universe.** Discover supported instruments/timeframes from existing configuration and provider registries. Do not silently test only a few symbols.
4. **No fabricated production data.** Synthetic fixtures are allowed only in clearly labelled tests. Never present simulated data as real market data.
5. **No fake learning.** Storing observations or changing workflow statuses does not prove a strategy learned or improved.
6. **Preserve useful functionality.** Audit existing market context, structure, liquidity, indicators, regime, contradiction, confidence, risk, similarity, ML, research and paper-trading components before replacing anything.
7. **No blind rewrites.** Trace the actual failure and add a reproducing test before changing an engine.
8. **No silent failures.** Record structured errors and prevent unsafe decisions when a required component fails.
9. **No secrets in code or frontend.** Use existing validated configuration. Never print or commit secret values.
10. **Preserve user data.** Do not reset/truncate databases. Inspect schema, migrations and RLS before proposing changes. Use versioned, backward-compatible migrations where necessary.
11. **Do not claim tests or runtime behavior passed unless actually executed.**
12. Keep changes scoped. Avoid unrelated redesigns, frameworks or dependencies.
13. If removing the Bollinger engine remains a current requirement, trace all registrations, selectors, tests, persistence and UI references. Remove it consistently without deleting unrelated ATR/volatility functionality.
14. Research candidates must not silently rewrite active production rules after a handful of wins. Promotion must be versioned, validated, auditable and reversible.
15. Use structured, timestamped OHLCV/provider data as the primary decision input, not screenshots.

## 2. Stage 0: establish the real repository baseline

Before changing code:

1. Inspect current branch, commit, working-tree changes, package scripts, lockfile, Node requirement, TypeScript settings and test/lint/build scripts.
2. Read relevant source and imports. Starting points include:
   - `backend/src/engines/decision-engine.ts`
   - `backend/src/engines/confidence-engine.ts`
   - `backend/src/engines/contradiction-engine.ts`
   - `backend/src/engines/market-context-engine.ts`
   - `backend/src/engines/market-structure-engine.ts`
   - `backend/src/engines/strategy-engine.ts`
   - `backend/src/engines/research-engine.ts`
   - `backend/src/services/decisionService.ts`
   - `backend/src/routes/decisions.ts`
   - `backend/src/autonomy/pipeline.ts`
   - `backend/src/autonomy/paper-autopilot.ts`
   - `backend/src/trader/candle-math.ts`
   - `backend/src/trader/research.ts`
   - `src/lib/strategies/index.ts`
   - `src/lib/persistence/learning-research-persistence.ts`
3. Treat these as starting paths, not guaranteed current paths. Locate the real files if the repository changed.
4. Trace all routes from candle retrieval to user-visible decisions and paper-trade actions. Identify alternate analysis paths and duplicated logic.
5. Determine how timestamps, candle closure, timeframe boundaries, freshness and provider failures are represented.
6. Determine whether experiment results actually affect strategy evaluation or are merely stored.
7. Inspect existing tests and establish valid package commands.
8. Record baseline test/build results. If blocked, report the exact command and error.
9. Never print secret values. Check only whether expected environment variables are set and safely scoped.

Create `docs/decision-learning-audit.md` (or an equivalent existing documentation location) containing the branch/commit, decision-flow diagram, file responsibilities, confirmed defects with reproduction steps, unverified risks, baseline test results, data/schema risks and minimal fix sequence. Only call an issue confirmed when supported by code or a reproducing test.

## 3. Primary objective: separate bias, setup, confirmation and action

The system must not treat a directional opinion as sufficient reason to trade. Implement or refactor this pipeline, reusing existing components and types where possible:

1. Data validation
2. Market context/directional bias
3. Setup detection
4. Entry confirmation
5. Contradiction/invalidation checks
6. Risk and portfolio approval
7. Final decision and explanation

Do not create duplicate engines if existing modules can be extended safely.

### 3.1 Data validation

Validate:
- finite, valid OHLCV values;
- `high >= max(open, close)` and `low <= min(open, close)`;
- volume according to documented provider semantics;
- chronological timestamps and duplicate candles;
- timeframe alignment and candle boundaries;
- enough history for every calculation;
- source identity and last successful fetch time;
- whether the latest candle is closed, forming or unknown;
- gaps, stale data, out-of-order records and provider errors.

Do not assume the last array item is closed. Determine closure from reliable provider metadata or documented timeframe boundaries and a trustworthy clock. If closure cannot be established, mark it unknown and block confirmed-entry decisions.

Use explicit data states:
- `FAILED`: invalid/unusable; block analysis.
- `STALE`: beyond configured provider/timeframe freshness limit; block actionable decisions.
- `DEGRADED`: analysis may be displayed, but must not authorize a paper entry if correctness is affected.
- `READY`: sufficient for requested analysis.

Freshness limits must be configurable and appropriate to provider/timeframe. Do not apply one arbitrary threshold to every market.

### 3.2 Market context and bias

Evaluate trend/range, swing structure, support/resistance, volatility regime, multi-timeframe context where sufficient history exists, and relevant market session/calendar context only where applicable.

Represent bias separately from entry action. Reuse compatible existing types or define clear values such as `BULLISH`, `BEARISH`, `RANGING`, `MIXED`, `UNKNOWN`.

A red candle in a bullish context must not trigger SELL solely due to its color. A green candle in a bearish context must not trigger BUY solely due to its color. Candle color is descriptive evidence, not a complete strategy.

Every structure/liquidity event must have explicit detection criteria and price/time references. Insufficient history means `UNKNOWN`, not a fabricated state.

### 3.3 Setup detection

Audit implemented strategy families such as trend continuation/pullback, momentum, breakout/retest, mean reversion, market structure, liquidity sweep/reclaim and price-action rejection. Only treat a strategy as implemented if it has real logic, not a stub or constant output.

A setup record should include, where appropriate:
- stable strategy/setup identifier and version;
- symbol, market type, timeframe and candle timestamp;
- direction and setup type;
- supporting evidence with source candle/price references;
- invalidation condition;
- status: developing, confirmed, invalidated, expired or insufficient data;
- trigger condition and data-quality status.

Derive eligibility from the configured universe/provider registry, not a hardcoded list.

### 3.4 Entry confirmation

A setup is not an entry until its own documented trigger is confirmed. Confirmation is strategy-specific. Do not apply a generic candle-color rule to every setup.

For closed-candle strategies:
- use only candles whose closure is verified;
- reference the exact candle that confirmed the trigger;
- do not use future candles in historical decisions except explicitly in backtests;
- prevent duplicate decisions for the same symbol/timeframe/setup version/confirmation candle unless multiple independent setups are explicitly supported.

A forming but unconfirmed setup returns `WAIT` with the next required condition. No suitable setup returns `NO_TRADE`. Reuse existing enums where possible and preserve API compatibility.

### 3.5 Confluence and contradictions

Review confidence and contradiction engines before editing. Do not invent numeric weights without validation.

- Group correlated evidence so indicators derived from the same price movement do not count as independent confirmations.
- Distinguish evidence agreement from statistical independence.
- Represent higher-timeframe disagreement and apply documented strategy-specific rules.
- High confidence cannot compensate for bad data, a missing setup or a failed risk gate.
- Include conflicting evidence in the explanation.
- Do not allow one aggregate score to bypass mandatory gates.

Thresholds must be documented, configurable and evaluated out of sample. Do not tune and report performance on the same final test set.

### 3.6 Risk and final approval

Risk approval is separate from bias and setup detection. Before producing an actionable paper-trade proposal, verify:
- valid entry/stop levels;
- stop tied to setup invalidation where appropriate;
- positive, correct risk distance;
- target/reward-to-risk;
- quantity/position size under existing risk configuration;
- account exposure/concentration limits;
- market-specific quantity precision, tick size, contract units and costs where metadata supports them;
- no duplicate/conflicting active paper order or position;
- fresh, valid market data.

Never invent a stop, target or quantity to make the result look complete. Missing risk inputs must block the proposal with a reason. The system remains paper-only.

## 4. Decision explanation contract

Adapt current API types and UI without breaking clients. A decision should include, where applicable:
- decision ID and engine version;
- symbol, market type, timeframe and provider;
- last closed candle timestamp and closure-verification status;
- data-quality state and warnings;
- market bias and supporting evidence;
- selected setup and version;
- entry confirmation state and trigger candle;
- supporting and contradictory evidence with references;
- invalidation condition/level;
- entry, stop, target, risk distance and reward-to-risk if calculable;
- confidence meaning and calibration state;
- reason codes, human-readable explanation and blocked conditions;
- next condition required to reassess;
- strategy/research version.

Do not call a score a probability unless calibration supports that interpretation. Otherwise label it uncalibrated. Generate explanations from actual engine outputs, not invented facts. If an LLM writes explanations, constrain it to supplied evidence and keep deterministic decision logic authoritative.

Use optional fields or explicit API versioning, and update backend types, schemas, serializers, frontend consumers and tests together.

## 5. Learning/research must be evidence-based

Audit existing learning, research, persistence, experiment and paper-outcome flows before adding new abstractions.

Keep distinct concepts:
- observation;
- hypothesis;
- reproducible experiment;
- versioned candidate;
- validation report;
- promotion decision;
- paper-monitoring result.

A workflow status transition is not validation. Never set validated solely because an experiment is marked complete.

### 5.1 Reproducible experiment metadata

Store sufficient information to reproduce:
- hypothesis and expected effect;
- strategy/decision-engine version;
- configuration/parameter snapshot;
- dataset/provider provenance and date range;
- included instruments/timeframes;
- chronological train/validation/test windows where applicable;
- fees, spread, slippage and fill assumptions;
- random seed if applicable;
- metrics and sample sizes;
- failed checks and limitations;
- final decision and explanation.

Never store credentials or private environment variables in experiment metadata.

### 5.2 Validation

Reuse existing research metrics only after checking their calculations and tests. Evaluate:
- expectancy in R after costs;
- profit factor and maximum drawdown;
- trade count/effective sample size;
- win/loss distribution;
- calibration metrics such as Brier score/reliability bins when applicable;
- results by setup, symbol, timeframe and regime;
- walk-forward stability;
- sensitivity to costs/slippage and reasonable parameter changes;
- comparison with the current version and a simple baseline.

Guard against look-ahead bias, leakage between chronological splits, selection bias, excessive tuning, small samples, omitted costs and unrealistic fills.

Use explicit configurable acceptance criteria. Do not invent universal profitability thresholds. Insufficient sample size or inconclusive evidence returns `INSUFFICIENT_EVIDENCE`.

### 5.3 Promotion and rollback

Promote only when all validation gates pass. Record old/new versions, validation report, approval status/reason, promotion timestamp and rollback target. Promotion must be separate from experiment execution. A failed candidate leaves the active version unchanged. Default to human approval unless a deliberate secure/auditable auto-promotion policy already exists.

Learn from losses as well as wins. Distinguish a valid process with a loss, an invalid entry, data failure, simulation/execution issue, regime mismatch, management issue, and a win produced by weak reasoning. Evaluate process quality separately from outcome.

## 6. Paper-trading lifecycle consistency

Trace analysis routes, decision service, autonomy pipeline, paper autopilot and persistence.

Ensure:
- one authoritative decision pipeline is shared where appropriate;
- no alternate path skips data, confirmation, contradiction or risk gates;
- each candle is processed at most once per decision key;
- retries are idempotent;
- restarts cannot duplicate paper entries;
- paper orders/positions reference the exact decision and candle;
- stops/targets use consistent units;
- partial failures are recorded and recover safely;
- stale data never causes a new paper entry;
- outcomes link to decision, setup, strategy and experiment versions.

Share domain logic while retaining explicit adapters for workflows that legitimately differ.

## 7. Instrument/timeframe coverage

Build the test matrix dynamically from the configured instrument universe and provider registry. Do not test only a small hardcoded list.

For each supported instrument/timeframe, report:
`PASS`, `FAIL`, `BLOCKED`, `UNAVAILABLE`, or documented `NOT_APPLICABLE`.

Test historical candle validity/order, closure/timeframe boundaries, freshness/outages, symbol mapping, minimum indicator history, decision compatibility, market-specific risk/precision and paper lifecycle idempotency. Use bounded concurrency and respect rate limits. Distinguish unsupported instruments from provider outages. Never silently skip instruments. Synthetic data is test-only and must be labelled.

## 8. Required tests

### Decision tests
1. Red candle during bullish trend does not trigger SELL solely due to color.
2. Green candle during bearish trend does not trigger BUY solely due to color.
3. Forming candle cannot confirm a closed-candle entry.
4. Unknown candle closure blocks actionable decisions.
5. Unconfirmed breakout returns WAIT.
6. Confirmed setup proceeds only if data and risk gates pass.
7. Missing setup cannot be overridden by high aggregate confidence.
8. Correlated indicators do not inflate independent confluence.
9. Conflicting evidence appears in explanation.
10. Invalid OHLCV, duplicate/out-of-order timestamps and insufficient history are explicit.
11. Stale data blocks paper-entry authorization.
12. Strategy exceptions appear in diagnostics and cannot produce a falsely clean result.
13. Invalid stop/target/quantity blocks a proposal.
14. Same confirmation candle cannot create duplicate paper actions.
15. Identical data/config/version produces deterministic decisions unless documented otherwise.

### Learning/research tests
1. Incomplete experiment cannot be validated.
2. Failed acceptance criteria cannot be promoted.
3. Insufficient sample returns insufficient evidence.
4. Chronological splits prevent future-data leakage.
5. Costs/slippage are included.
6. Results are reproducible from stored metadata.
7. Promotion is versioned and auditable.
8. Failed promotion leaves active version unchanged.
9. Rollback restores prior version.
10. A win/loss alone does not promote/reject a candidate.
11. Zero trades/losses and missing outcomes do not leak NaN/Infinity into decisions.
12. Calibration is unavailable when evidence is insufficient.

### Integration/lifecycle tests
Cover API schema compatibility, shared decision rules, paper-autopilot idempotency, restart/retry recovery, migrations/RLS if needed, configured instrument/timeframe coverage, and UI handling for WAIT/NO_TRADE/BLOCKED/degraded analysis. Use the existing test framework unless it is demonstrably inadequate.

## 9. Diagnostics

Add structured, privacy-safe diagnostics that answer:
- which candle triggered analysis and whether it was closed;
- provider/timeframe and freshness;
- market bias and detected setup;
- which confirmation passed/failed;
- supporting/conflicting evidence;
- which gate approved/blocked;
- active engine/strategy version;
- why the result is BUY, SELL, WAIT, NO_TRADE or BLOCKED.

Reuse existing reason-code conventions. Potential codes include `DATA_STALE`, `CANDLE_NOT_CLOSED`, `INSUFFICIENT_HISTORY`, `NO_VALID_SETUP`, `ENTRY_UNCONFIRMED`, `CONFLICTING_CONTEXT`, `RISK_LIMIT_EXCEEDED`, `INVALID_STOP`, `DUPLICATE_DECISION`, `STRATEGY_EXECUTION_FAILED`, and `INSUFFICIENT_RESEARCH_EVIDENCE`. Do not log secrets or unnecessary personal data, and avoid unbounded per-candle logging.

## 10. Frontend behavior

Inspect the current UI first. Keep its design system and avoid unrelated redesign. Clearly distinguish:
- bias from an entry signal;
- developing from confirmed setup;
- WAIT from NO_TRADE;
- blocked from ordinary no-trade;
- calibrated probability from uncalibrated score;
- fresh from stale/degraded data.

Display actual reasons, next confirmation condition, last closed-candle timestamp and warnings. Never display a confirmed BUY/SELL if entry/risk gates have not passed. Do not add manual execution controls. Preserve responsive, accessible loading/error/empty states.

## 11. Security and persistence

Follow existing auth, authorization, input validation and RLS conventions. Do not trust client-supplied risk approval, balances, decisions or promotion status without server validation. Use transaction/idempotency patterns for paper actions. If schema changes are necessary, inspect schema/RLS first and add versioned migrations. Never reset data. Keep privileged Supabase keys server-only and out of all `VITE_` variables. Add authorization tests for new research/promotion/audit endpoints. Avoid storing sensitive user data in research records.

## 12. Work in these stages

### Stage 0 — Audit
Inspect repository state, decision paths, tests, schema and scripts. Write `docs/decision-learning-audit.md`. Run baseline tests/typecheck/lint/build. Report blockers. Avoid speculative changes.

### Stage 1 — Candle/data correctness
Centralize or reuse candle validation and closure logic. Trace every analysis path. Add tests for closure, ordering, timeframe boundaries, stale data and invalid OHLCV. Fail closed for actionable decisions.

### Stage 2 — Decision pipeline
Separate bias, setup, confirmation, contradiction, risk and final action. Fix score aggregation and correlated evidence. Preserve API compatibility. Add reason codes and explanations. Test every focused change.

### Stage 3 — Strategy selection
Make selected strategy, detected setup and confirmed trigger consistent. Audit all registry/selection paths. Remove Bollinger paths consistently only if that remains the current requirement. Test active strategies and market categories.

### Stage 4 — Risk and paper lifecycle
Reuse centralized risk approval. Fix idempotency/duplicate candle processing. Link decisions/orders/positions and implement safe recovery. Test restart/retry.

### Stage 5 — Learning/research
Verify metrics. Add reproducible experiment metadata, explicit validation, promotion gates, versioning and rollback. Failed candidates cannot affect active rules.

### Stage 6 — Frontend explanation
Show structured evidence, setup state, candle timestamp, data health and calibration state. Update API/frontend types and tests together. No manual execution controls.

### Stage 7 — Full verification
Run unit/integration tests, typecheck, lint, production build and configured instrument/timeframe checks. Use real provider data only where configuration/network access allows. Test paper flows without enabling live execution. Report exact commands and results.

Do not advance past a critical failing gate unless the blocker is documented and later work is safely isolated.

## 13. Definition of done

- [ ] Actual repository state and decision paths documented.
- [ ] Confirmed defects supported by source references/reproducing tests.
- [ ] Candle closure consistently handled across all paths.
- [ ] Data validation, freshness and timeframe boundaries tested.
- [ ] Bias, setup, confirmation and risk approval are distinct.
- [ ] Candle color alone cannot create an actionable decision.
- [ ] Correlated evidence cannot inflate confluence.
- [ ] Missing setup/invalid data cannot be bypassed by confidence.
- [ ] Strategy selection and setup evidence are consistent.
- [ ] Strategy failures are visible.
- [ ] Explanations are grounded in structured evidence.
- [ ] Confidence meaning/calibration state is explicit.
- [ ] Research is reproducible and validated out of sample.
- [ ] Insufficient evidence is not treated as success.
- [ ] Promotion is gated, versioned, auditable and reversible.
- [ ] Paper actions are idempotent and tied to the correct candle/version.
- [ ] Every configured instrument/timeframe has an explicit result.
- [ ] No live execution or manual BUY/SELL execution feature was added.
- [ ] Existing data and security controls are preserved.
- [ ] Actual test/typecheck/lint/build results are reported.
- [ ] Remaining failures and unverified behavior are listed honestly.

## 14. Required final report

Provide:
1. Repository baseline: branch, commit and working-tree status.
2. Confirmed defects: file, function, root cause and reproduction.
3. Changes made: files and purpose.
4. Decision behavior before/after with concrete scenarios.
5. Learning/research changes and promotion gates.
6. Tests executed: exact commands and results.
7. Instrument/timeframe coverage, including failures.
8. Database/configuration changes: names only, never secret values.
9. Security/regression review and paper-only assurance.
10. Remaining blockers and unverified behavior.

Do not claim the system is profitable or equivalent to a professional human trader. The goal is a more disciplined, explainable, testable decision system with controlled learning and safe paper validation.

## Start now

Begin at Stage 0. Inspect the actual repository, map the decision flow, write the audit and reproducing tests, then implement the smallest safe fixes in sequence. Do not stop after producing a plan; proceed with implementation where repository access allows. If blocked by permissions, files, environment or credentials, state the exact blocker and continue with independent safe work.
