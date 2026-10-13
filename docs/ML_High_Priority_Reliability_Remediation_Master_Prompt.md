# ML Trading Intelligence Platform
# High-Priority Reliability, Safety, and Quality Remediation Master Prompt

## Instructions for the AI Coding Agent

You are acting as the **Chief Software Architect, Senior Full-Stack Engineer, Quantitative Systems Engineer, QA Lead, DevSecOps Engineer, and Technical Auditor** for this repository:

- Repository: `https://github.com/keelson18/ML`
- Product: AI Trading Intelligence Platform
- Required execution mode: **paper/simulation trading only**
- Core objective: make market analysis, decisions, research, paper execution, accounting, security, and operations reliable and auditable.

Read this entire document before modifying code. Then work through the stages in order. Do not skip directly to implementation.

This is an implementation brief, not permission to invent the repository's architecture. **Inspect the current code first, establish the real state, and adapt this plan to verified findings.**

---

# 1. Non-Negotiable Rules

1. **Paper trading only.** Do not add live broker execution, real-money order placement, withdrawal functionality, or a path that can accidentally route a simulated order to a real account.
2. **No Python.** Preserve the repository's existing TypeScript/JavaScript architecture unless the repository itself proves a different supported stack is already in use. Do not introduce a Python service.
3. **No fake market data or fake success.** Never replace a failed real/delayed data request with invented candles, prices, fills, balances, model scores, or experiment results. Clearly label any deterministic synthetic fixtures used strictly in automated tests.
4. **No hardcoded business configuration.** Keep supported instruments, provider capabilities, timeframes, risk limits, thresholds, and environment-dependent settings in validated configuration or database-backed settings as appropriate. Security-critical defaults must be conservative and fail closed. Do not put secrets or privileged settings in frontend bundles.
5. **No destructive database changes.** Preserve existing user data, paper trades, accounts, research results, audit history, and schema compatibility. Use versioned, forward-only migrations. Never reset, drop, truncate, or rewrite production data to make tests pass.
6. **No unsupported claims.** Never say a test, migration, build, audit, or security check passed unless it was actually executed and its result observed. Distinguish repository notes from newly verified results.
7. **No broad refactor without evidence.** Follow SOLID, DRY, KISS, clear module boundaries, explicit types, and existing conventions. Avoid unrelated rewrites and unnecessary dependencies.
8. **Keep the UI honest.** The UI must distinguish `WAIT`, `NO_TRADE`, `BLOCKED`, `PENDING`, `OPEN`, `CLOSED`, `REJECTED`, and error states where applicable. Do not display an order as filled or an experiment as successful before authoritative backend confirmation.
9. **Security first.** Validate and authorize all server-side state changes. Keep privileged Supabase credentials server-side only. Do not expose or request secret values in reports, logs, screenshots, tests, or chat.
10. **No bypasses.** Do not add “force trade,” “ignore risk,” “use forming candle,” “skip validation,” or similar bypasses to get tests or the UI working.
11. **Explain code for maintainers.** Add concise comments for non-obvious safety decisions, invariants, recovery paths, and security controls. Comments should explain why, not narrate obvious syntax.
12. **Use the repository's existing package manager and lockfile.** Do not regenerate or replace lockfiles with a different package manager.

---

# 2. Mission and Success Criteria

Audit, fix, and verify the following risk areas:

1. Independent risk controls.
2. Market-data integrity and provider failure handling.
3. Decision-to-execution consistency and idempotency.
4. Paper account, position, fill, and ledger integrity.
5. Research and learning validity, including leakage prevention.
6. Realistic paper execution and performance accounting.
7. Authentication, authorization, secret management, and API security.
8. Scheduler reliability, concurrency, and crash recovery.
9. Market-regime awareness and strategy conflict handling.
10. Reproducible decisions and complete audit trails.
11. Instrument/timeframe/provider consistency.
12. Honest frontend state and useful operational observability.
13. Performance, resource bounds, and graceful degradation.
14. Automated regression tests and deployment safety.

Do not mark the project “fixed” merely because it compiles or the dashboard renders. The goal is verified system correctness.

---

# 3. Stage 0 — Establish Repository State Before Changes

## 3.1 Inspect before editing

1. Read the project instructions (`AGENTS.md`, `README`, architecture docs, existing prompts, and relevant docs).
2. Inspect the current branch, working tree, latest commits, package scripts, dependency versions, and lockfile.
3. Map the frontend, backend, API routes, decision engine, strategy engine, risk engine, data providers, paper execution, ledger, database migrations, authentication, research/learning, scheduler, and tests.
4. Trace actual end-to-end flows:
   - provider → candle normalization → candle validation → closed-candle selection;
   - candles → indicators/market context → directional bias → setup detection → entry confirmation → risk approval → trade plan → paper executor;
   - paper order/fill → account/position/ledger update → UI;
   - research data → experiment → evaluation → promotion/rejection → decision engine;
   - authenticated user → API → authorization → database/RLS.
5. Find every code path that can create, modify, close, or reconcile a paper trade. Search for duplicate schedulers, legacy execution paths, manual order actions, hidden fallback providers, and frontend calculations that disagree with backend truth.
6. Identify whether every claimed provider and timeframe is genuinely implemented, not merely named in a selector.
7. Establish the exact existing test commands and which tests need external services, secrets, a database, or network access.

## 3.2 Record findings

Create or update a repository audit document such as `docs/reliability-remediation-audit.md` with:
- verified defects and severity;
- affected files/modules and call paths;
- reproduction steps;
- expected versus actual behavior;
- existing tests and missing tests;
- migration/security risks;
- questions that cannot be resolved without credentials or external services;
- proposed minimal fix per defect.

Use these severity definitions:

- **P0 Critical:** can create unsafe or invalid execution, corrupt accounting, expose privileged credentials, or falsify market/learning results.
- **P1 High:** can materially mislead decisions, prevent safe recovery, weaken security, or break a core workflow.
- **P2 Medium:** reliability, usability, maintainability, or performance issue with a contained impact.
- **P3 Low:** cosmetic or nonessential improvement.

Do not assume every listed risk is a current defect. Verify first. If a control is already correct, document evidence and add regression coverage where appropriate instead of rewriting it.

**Stage 0 exit gate:** a verified system map, risk register, baseline test report, and staged implementation plan exist before significant code changes.

---

# 4. Stage 1 — Independent Risk Engine and Safety Gates (P0)

## Objective

Make risk approval an authoritative server-side gate that cannot be overridden by strategy confidence, UI state, model output, or research recommendations.

## Requirements

1. Find all risk calculations and all order/plan creation entry points. Consolidate shared rules behind a clearly defined server-side risk approval interface where this reduces inconsistency.
2. Validate inputs before calculating risk:
   - instrument and quote/base currency mapping;
   - entry, stop, target, tick size, lot/quantity step and minimum/maximum order size;
   - account balance/equity and available capacity;
   - open positions and pending plans;
   - fees, spread, slippage assumptions and applicable market constraints.
3. Calculate position size from configured account risk and stop distance using instrument-specific contract/precision metadata. Do not apply one instrument's contract assumptions to all assets.
4. Enforce configurable limits, as applicable:
   - maximum risk per trade;
   - aggregate open risk;
   - per-instrument and correlated exposure;
   - maximum number of open positions and pending plans;
   - daily drawdown/loss and equity drawdown;
   - strategy-specific limits;
   - minimum reward/risk requirements;
   - stale-data and volatility restrictions.
5. All limits must have validated configuration, clear units, safe ranges and auditable changes. Do not silently fall back to an unsafe default if a value is missing or invalid.
6. A high model confidence score must never override a rejected risk gate.
7. Fail closed if a required risk input cannot be determined. Return a structured rejection reason rather than silently continuing.
8. Recheck critical limits immediately before paper execution, not only when the initial setup is created.
9. Ensure risk validation is atomic with the state change where practical. Use database transactions/locking or version checks to avoid two simultaneous requests each consuming the same available risk capacity.
10. Ensure UI controls cannot bypass server-side checks.

## Required tests

- missing, non-finite, zero, negative, and out-of-range inputs;
- wrong symbol metadata or currency mapping;
- stop distance of zero or wrong direction;
- oversized order and insufficient paper-account capacity;
- risk limit exceeded despite high model confidence;
- concurrent plans competing for the same risk capacity;
- daily loss/drawdown boundary;
- unavailable risk data;
- changed risk configuration between planning and execution.

**Acceptance gate:** every order path must pass the same authoritative risk gate. Invalid or excessive risk always blocks execution, with a test proving it.

---

# 5. Stage 2 — Market-Data Integrity and Provider Resilience (P0)

## Objective

Prevent stale, malformed, mismapped, duplicated, incomplete, or fabricated market data from influencing decisions.

## Requirements

1. Create or verify one canonical candle validation/normalization layer used by every provider and consumer.
2. Validate:
   - timestamp format, timezone, ordering, interval alignment and reasonable bounds;
   - finite numeric OHLCV values;
   - `high >= max(open, close)`, `low <= min(open, close)`, `high >= low`;
   - nonnegative volume when volume is supported;
   - duplicates and gaps;
   - expected symbol, quote currency and timeframe;
   - provider source and retrieval timestamp.
3. Treat closed-candle determination as a shared time-boundary utility. Do not use `slice(0, -1)` or provider-specific assumptions as a substitute for checking the actual candle close boundary.
4. Use one authoritative clock abstraction where practical and test exact boundary behavior, timezones, interval alignment, and clock skew.
5. Do not process a forming candle as a confirmed entry signal. If no valid closed candles remain, return an explicit no-data/block state.
6. Track freshness using instrument/timeframe-specific expectations and provider metadata. Distinguish delayed data from stale data. Do not label delayed data as real-time.
7. Handle provider timeouts, rate limits, malformed payloads, empty results, authentication failures and WebSocket disconnects with bounded retries, exponential backoff and jitter where appropriate.
8. Avoid retry storms. Bound concurrent requests, queued work, connection counts and retained candle history.
9. If a provider fails, show the failure and last successful update time. Do not silently generate substitute prices or candles.
10. Make fallback behavior explicit, configurable and visible. A fallback may use another verified provider only if symbol semantics, timestamps and data quality are validated. Never silently fall back to synthetic market data.
11. Store enough provenance to reconstruct which source and candle set drove a decision.
12. Verify all listed instruments and timeframes against provider capability metadata. Do not expose unsupported combinations as working.
13. Ensure reconnects cannot append duplicate candles or reorder history.

## Required tests

- candle boundary just before, at and after close;
- forming final candle with valid previous closed candles;
- all candles forming or stale;
- malformed OHLC, `NaN`, infinity, negative prices and duplicate timestamps;
- missing interval and out-of-order provider responses;
- rate limit, timeout, unauthorized provider and disconnected WebSocket;
- fallback provider symbol mismatch;
- no synthetic fallback after data failure;
- timezone, daylight-saving where relevant, and clock-skew scenarios.

**Acceptance gate:** invalid or stale data cannot cause a confirmed trade, and provider failure never masquerades as valid market data.

---

# 6. Stage 3 — Decision-to-Execution Consistency and Idempotency (P0)

## Objective

Ensure that one valid, approved trade plan can create at most one paper execution, while rejected or unconfirmed setups cannot create orders.

## Requirements

1. Document and enforce explicit states for the decision and trade-plan lifecycle. Use existing project naming if equivalent states exist:
   - `WAIT`;
   - `NO_TRADE`;
   - `BLOCKED`;
   - `SETUP_DETECTED`;
   - `ENTRY_CONFIRMED`;
   - `RISK_APPROVED`;
   - `PENDING`;
   - `OPEN`;
   - `CLOSED`;
   - `REJECTED`;
   - `EXPIRED`;
   - `ERROR`.
2. Keep directional market bias separate from an actionable entry decision. A bullish or bearish bias is not itself an order.
3. Require setup detection, entry confirmation, data-quality approval and risk approval before creating an executable paper plan.
4. Verify that the actual planner, confirmer, risk engine and executor are wired end-to-end. Avoid a design where the decision endpoint correctly returns `NO_TRADE` but a separate consumer expects `BUY`/`SELL`, or where no component can ever create a valid plan.
5. Define a single authoritative execution service. Remove or disable duplicate/legacy execution paths only after tracing all callers and adding regression tests.
6. Use idempotency keys or unique constraints for plan execution, based on stable plan identity and intended execution event. Do not rely only on in-memory flags.
7. Make state transitions explicit and validate allowed transitions. Reject duplicate, out-of-order and stale transitions.
8. Revalidate candle closure, plan expiry, current price bounds, data freshness and risk immediately before execution.
9. Ensure retries return the existing result rather than producing a second paper order.
10. Define deterministic behavior for timeouts: distinguish “not submitted,” “submitted but response unknown,” and “confirmed.” Reconcile unknown outcomes from persisted state before retrying.
11. Never treat a plan as filled until the execution simulator confirms a fill according to its rules.
12. Keep manual BUY/SELL controls absent if the product's autonomous-only requirement remains in force. Do not add a hidden manual bypass.

## Required tests

- one valid plan completes the intended paper flow;
- directional bias without setup creates no order;
- unconfirmed entry creates no order;
- risk rejection creates no order;
- stale or expired plan creates no order;
- repeated scheduler call creates no duplicate;
- concurrent executor calls produce at most one execution;
- process restart after persistence but before response;
- invalid state transition is rejected;
- UI/backend state contract matches.

**Acceptance gate:** one eligible plan produces at most one paper execution; every ineligible plan produces none.

---

# 7. Stage 4 — Paper Account, Positions, Fills and Ledger Integrity (P0)

## Objective

Make all account and trade state changes consistent, transactional, reconcilable and auditable.

## Requirements

1. Map the authoritative source of truth for account balances, equity, positions, orders, fills, fees, realized/unrealized P&L and ledger entries.
2. Avoid independently maintained totals that can drift without reconciliation.
3. Where supported by the database, use transactions for logically atomic changes to order/fill/position/account/ledger records. If transactions are not available across components, use an explicit durable state machine and reconciliation process.
4. Enforce idempotency for fills, fees, closing events and ledger entries with database constraints as well as application checks.
5. Define sign conventions, currency precision, rounding and realized/unrealized P&L rules in one shared accounting module.
6. Ensure an entry fill updates all required records exactly once. Ensure a close event realizes P&L and fees exactly once.
7. Treat partial fills, rejected fills, zero-quantity fills, missing price and impossible position transitions explicitly if the simulator supports them. Do not fabricate a fill to hide an error.
8. Add a reconciliation routine that compares derived account state against persisted ledger history. Report differences and preserve evidence.
9. Verify empty-account initialization, first trade, partial processing, retries, trade close, restart and ledger checkpoint behavior.
10. Use optimistic version checks or row/advisory locks for concurrent account changes where appropriate.
11. Keep audit logs append-only or tamper-evident where the current design supports this, and ensure privileged mutation paths are tightly controlled.
12. Do not modify or delete historical user data to force a reconciliation pass. Provide a safe migration or repair report requiring explicit approval for any data correction.

## Required tests

- opening and closing a position;
- profitable and losing trade with fees;
- rounding and precision boundaries;
- duplicate fill and duplicate close;
- stale account version and concurrent updates;
- empty ledger and first ledger entry;
- crash between related state changes;
- reconciliation detects deliberate test-only corruption;
- no data loss during migration.

**Acceptance gate:** balances, positions, fills and ledger reconcile after every tested state transition, with duplicate processing unable to double-count.

---

# 8. Stage 5 — Research, Learning and Strategy Promotion Integrity (P0/P1)

## Objective

Ensure the research loop discovers useful knowledge without data leakage, overfitting, unrepeatable results or unreviewed production changes.

## Requirements

1. Trace the actual research pipeline from data selection through experiment, metrics, validation, documentation, promotion/rejection and later decision use. Verify it performs real work rather than only changing status fields.
2. Split datasets chronologically. Do not randomly shuffle time-series data in ways that leak future regimes into the past.
3. Prevent look-ahead leakage in features, labels, normalization, candle-close handling, entry timing, exit timing and dataset construction.
4. Use walk-forward and untouched out-of-sample evaluation where appropriate. Preserve a final holdout that cannot be repeatedly tuned against.
5. Include realistic spread, fees, slippage, execution constraints and any relevant latency assumptions in simulation.
6. Track sample size, trade count, time span, market regimes, instruments and timeframes. Reject insufficient evidence even when the headline result is profitable.
7. Evaluate expectancy in R, profit factor, maximum drawdown, exposure, trade count, calibration and uncertainty where appropriate. Do not promote based on win rate alone.
8. Use confidence intervals or bootstrap methods where appropriate, with time-series-aware resampling rather than an invalid IID assumption.
9. Compare candidates to a documented baseline. Record failed experiments as well as successful ones.
10. Version each strategy, feature set, data snapshot, cost model, parameter set, evaluation method and code revision.
11. Keep research output separate from active production decision configuration until promotion gates pass.
12. Require explicit, auditable promotion rules and a rollback path. The model must not self-modify risk limits or production code.
13. Detect repeated tuning against the same holdout and avoid promoting candidates based on multiple-testing luck.
14. Preserve experiment lineage and enough information to reproduce the exact evaluation.
15. Make research jobs resumable and idempotent. A restart must not turn an incomplete experiment into a successful one.
16. Never manufacture sample results or use synthetic candles outside clearly labelled tests.

## Required tests

- feature or label that accidentally uses future data is detected by test design;
- chronological split boundaries are correct;
- insufficient sample is rejected;
- a profitable but high-drawdown candidate is rejected;
- costs can turn a grossly profitable candidate into a rejected candidate;
- candidate cannot become active before all gates pass;
- failed or interrupted experiment cannot be promoted;
- experiment can be reproduced from its versioned inputs;
- rollback restores the prior approved strategy configuration.

**Acceptance gate:** no candidate is promoted without passing verifiable data, sample, risk, cost and out-of-sample requirements.

---

# 9. Stage 6 — Realistic Paper Execution and Performance Metrics (P1)

## Objective

Ensure paper results represent the declared simulation assumptions rather than optimistic fills or accounting shortcuts.

## Requirements

1. Document the paper execution model: order types supported, trigger conditions, fill timing, spread, slippage, fees, rejected orders and gap behavior.
2. Never fill a buy or sell at a price that could not reasonably have been obtained under the model.
3. Avoid using the same candle's final high/low to claim an entry that logically could only be known after the candle closed, unless the model explicitly defines and justifies the sequence.
4. Define the handling of bars where both stop-loss and take-profit are touched and intrabar ordering is unknown. Use a conservative, explicit policy or finer-grained verified data.
5. Apply instrument-specific tick sizes, quantity steps, minimum sizes and fee schedules from validated metadata/configuration.
6. Use one accounting definition for fees, realized P&L, unrealized P&L, equity, return, drawdown and exposure.
7. Clearly distinguish gross P&L, net P&L, open-position P&L and closed-trade P&L.
8. Make all performance displays traceable to persisted fills and ledger entries.
9. Keep deterministic replay reproducible by dataset ID, code version, strategy version and execution-model version.
10. Label simulation outputs as paper results, not live market performance or guaranteed forecasts.

## Required tests

- entry and exit under the declared model;
- spread and slippage affect fills and P&L;
- fee accounting is applied once;
- stop and target both touched in a candle;
- gap through stop;
- no fill at an impossible price;
- replay produces stable output from identical versioned inputs;
- dashboard metrics reconcile with ledger calculations.

**Acceptance gate:** every reported performance metric can be traced to the simulator's documented assumptions and persisted records.

---

# 10. Stage 7 — Authentication, Authorization and API Security (P0/P1)

## Objective

Prevent unauthorized users, compromised sessions, malicious inputs and leaked credentials from changing critical state or accessing protected data.

## Requirements

1. Audit every API route and server action for authentication, authorization and input validation.
2. Enforce server-side role and ownership checks. Frontend route guards are not security boundaries.
3. Ensure admin-only functions require the expected role and any required MFA assurance. Do not trust a user-supplied role, account ID or owner ID.
4. Inspect Supabase RLS policies for each user-owned table and privileged table. Test both allowed and denied access.
5. Keep secret/service-role keys server-only. Never use privileged keys in `VITE_*` variables or frontend code. Avoid logging secrets, auth tokens or sensitive account data.
6. Validate environment variables at startup. Fail safely when required configuration is missing, malformed or inconsistent. Keep public and server-only environment variables explicitly separated.
7. Validate request body, query parameters, IDs, enum values, sizes and numeric bounds with the repository's established validation library.
8. Use parameterized queries and safe database APIs. Avoid dynamic SQL assembled from untrusted input.
9. Apply rate limiting, request-size limits, timeouts and abuse protections to sensitive or expensive endpoints.
10. Configure CORS, cookies, CSRF protection where applicable, security headers and session handling according to the deployed architecture.
11. Prevent IDOR/BOLA by verifying access to the exact requested resource, not merely checking that the user is logged in.
12. Ensure error responses do not reveal stack traces, secrets, internal SQL or unnecessary sensitive details.
13. Audit dependency vulnerabilities and unsafe dependency additions using the existing package manager.
14. Ensure administrative risk-setting and strategy-promotion changes create audit events.
15. Do not rotate, revoke or print credentials automatically. Report exposure risks and provide safe manual rotation instructions if required.

## Required tests

- unauthenticated access to protected endpoints;
- regular user calling admin endpoint;
- user accessing another user's account/plan/trade;
- missing or insufficient MFA assurance;
- malformed and oversized input;
- rate-limit behavior;
- RLS denied-access cases;
- frontend bundle inspection for privileged credentials;
- startup with missing or invalid required environment variables;
- safe error handling.

**Acceptance gate:** all critical state-changing APIs enforce server-side authorization, and privileged credentials are never shipped to the client.

---

# 11. Stage 8 — Scheduler, Concurrency, Crash Recovery and Reconciliation (P0/P1)

## Objective

Ensure background processing remains correct through overlap, retries, provider outages, application restarts and partial failures.

## Requirements

1. Inventory all schedulers, timers, cron jobs, queue consumers, WebSocket handlers and background loops.
2. Ensure one intended owner for each recurring task, with explicit coordination across multiple server instances.
3. Use distributed/database-backed leases or another proven coordination mechanism when more than one process can run the same task.
4. Make jobs idempotent, bounded, observable and safe to retry.
5. Define retry policy by error type. Do not retry permanent validation/authentication errors indefinitely.
6. Add exponential backoff and jitter where appropriate, maximum attempts and dead-letter/failed-job visibility if a queue exists.
7. Ensure graceful shutdown stops accepting new work, finishes or safely checkpoints in-flight work and releases leases.
8. On startup, reconcile interrupted plans, pending executions, account state and ledger state before resuming autonomous processing.
9. Avoid concurrent research runs on the same dataset/strategy when they would conflict or waste resources.
10. Ensure scheduler state cannot claim a task succeeded before its durable work is complete.
11. Add structured logs and metrics for start, finish, duration, retries, failures, skipped work, lease conflicts and reconciliation findings.

## Required tests

- overlapping scheduler ticks;
- two backend instances trying to claim the same job;
- provider outage and recovery;
- process restart mid-job;
- database timeout during state change;
- graceful shutdown during active work;
- retry of already completed work;
- stale lease recovery.

**Acceptance gate:** retrying or restarting jobs cannot duplicate trades, corrupt research state or leave critical work permanently stuck without a visible error.

---

# 12. Stage 9 — Market Regime, Strategy Conflicts and Confidence Calibration (P1/P2)

## Objective

Improve decision quality without treating correlated indicators as independent evidence or allowing market-regime labels to create unjustified confidence.

## Requirements

1. Inspect existing indicators and strategy families before adding any new indicators or models.
2. Identify correlated features and strategies. Avoid double-counting highly related signals as independent confluences.
3. Keep raw indicator outputs, normalized evidence, contradictions and final decision rationale separately observable.
4. If a market-regime classifier exists or is justified, define its features, timeframe, update frequency, uncertainty and validation method.
5. Do not require a regime label if evidence is weak. Provide an explicit uncertain/unknown state and let safety gates decide whether trading is allowed.
6. Validate strategy/regime combinations out of sample across multiple market conditions.
7. Monitor calibration: when the system says 70% confidence, check whether comparable historical decisions are successful approximately 70% of the time, using suitable sample sizes and uncertainty bounds.
8. Do not display a confidence score unless its meaning is documented and empirically evaluated.
9. Keep model or regime outputs advisory unless they have passed the same versioning and promotion gates as other production logic.
10. Preserve the user's existing supported instrument scope and strategy requirements. Do not silently expand into stocks, forex, or unsupported assets.

## Required tests

- conflicting directional signals;
- highly correlated indicators do not artificially multiply confidence;
- unknown regime produces conservative behavior;
- regime classification uses no future data;
- confidence calibration metrics handle small samples and missing outcomes;
- no regression in supported instrument/timeframe behavior.

**Acceptance gate:** confidence and confluence scores are interpretable, tested and unable to override data or risk safety gates.

---

# 13. Stage 10 — Reproducibility, Provenance and Audit Trail (P1)

## Objective

Make it possible to explain exactly why the system acted or waited and reproduce the decision from the same inputs.

## Requirements

1. Persist or reference a stable snapshot of the closed candles used for each consequential decision.
2. Record instrument, timeframe, provider, data timestamp, decision timestamp, candle identifiers, strategy/version, indicator/config versions, model version and risk-policy version.
3. Record the stages evaluated, evidence for and against the setup, blocking reasons, confidence definition, planned levels and final outcome.
4. Record experiment inputs, code revision, data snapshot, costs and evaluation output.
5. Use stable correlation IDs across request, decision, plan, execution, fill, ledger and audit events.
6. Do not log secrets, access tokens or unnecessary personal information.
7. Make audit history queryable by plan ID, trade ID, strategy version, instrument and time range.
8. Preserve prior versions when configuration changes; do not overwrite the only record of a past decision's configuration.
9. Add retention and storage bounds that do not silently delete records required for accounting or compliance.
10. Use hashes or tamper-evident links only where the system can maintain and verify them correctly. Do not claim cryptographic immutability without verification.

## Required tests

- complete trace from decision through ledger;
- reproduce a decision from its recorded inputs;
- configuration change does not rewrite history;
- audit log omits secrets;
- correlation IDs remain consistent through retries and recovery.

**Acceptance gate:** a developer can answer “why did it trade, why did it wait, and what data did it use?” with persisted evidence.

---

# 14. Stage 11 — Instrument, Timeframe and Provider Consistency (P1)

## Objective

Ensure the platform only offers market combinations that are truly supported and correctly normalized.

## Requirements

1. Create a canonical instrument metadata model with stable internal ID, display symbol, provider-specific symbol mappings, asset type, quote currency, precision, tick size, quantity rules, supported timeframes and provider source.
2. Keep provider mappings in configuration or database-backed metadata, not scattered conditionals and UI-only lists.
3. Validate symbols at the backend boundary. Do not trust frontend symbol strings.
4. Make the UI derive its options from verified backend capability metadata.
5. Distinguish USD-quoted instruments from USDT-quoted instruments. Do not relabel one as the other.
6. Do not claim real-time data if a provider is delayed or its plan does not support real-time delivery.
7. Ensure each timeframe's interval and close-boundary calculation is correct for the relevant provider and market calendar.
8. Handle unavailable instruments explicitly; do not silently substitute another symbol.
9. Keep the supported scope controlled by existing product requirements. Do not introduce unrelated asset classes without authorization.
10. Provide a diagnostics endpoint or equivalent internal report listing provider health, supported symbols/timeframes and last successful update.

## Required tests

- correct symbol mapping per provider;
- USD versus USDT distinction;
- unsupported symbol/timeframe rejected;
- precision and tick-size behavior;
- provider capability response matches actual implementation;
- missing provider credentials do not create false support claims.

**Acceptance gate:** every advertised market combination has a verified provider path and accurate data semantics.

---

# 15. Stage 12 — Frontend State Accuracy and Operational Observability (P1/P2)

## Objective

Make the interface explain current system state truthfully and help diagnose faults without presenting guesses as facts.

## Requirements

1. Treat the backend as authoritative for decisions, plans, fills, balances, P&L, research status and health state.
2. Remove or correct frontend logic that independently reconstructs critical trade or account state differently from the backend.
3. Distinguish:
   - market bias from entry decision;
   - no setup from unconfirmed setup;
   - rejected by risk from rejected by data quality;
   - pending from filled;
   - open from closed;
   - gross from net P&L;
   - stale provider from a healthy provider;
   - queued/running/failed/cancelled/completed research jobs.
4. Display timestamps with timezone context and identify the source and delay of market data.
5. Show actionable explanations for `WAIT`, `NO_TRADE`, `BLOCKED` and `ERROR` without exposing internals or secrets.
6. Provide loading, empty, stale, degraded, retrying and error states.
7. Avoid presenting old cached data as current. Label cached values and show last update time.
8. Add operational health indicators for provider connectivity, scheduler state, database health, last successful candle, last decision, last reconciliation and recent failures.
9. Avoid high-frequency polling and expensive UI rerenders. Use the existing streaming architecture where appropriate and clean up subscriptions.
10. Make critical controls accessible and responsive. Do not hide security/risk failures in color alone.
11. Ensure every UI action reflects backend confirmation and handles rejection/timeouts without optimistic false success.

## Required tests

- each state renders correctly;
- stale cache is clearly labelled;
- backend rejection appears accurately;
- network timeout does not show a successful fill;
- empty data differs from an error;
- subscriptions and polling clean up on navigation;
- critical information remains usable at narrow screen widths.

**Acceptance gate:** the UI cannot misrepresent an unconfirmed or failed backend operation as successful.

---

# 16. Stage 13 — Performance, Resource Limits and Graceful Degradation (P1/P2)

## Objective

Prevent research, market data, and UI workloads from destabilizing the application.

## Requirements

1. Measure before optimizing. Capture baseline startup, endpoint latency, memory, CPU, database query count and research-job duration where practical.
2. Bound candle history, result pagination, experiment concurrency, queued tasks, WebSocket connections, retry loops and response sizes.
3. Avoid repeated full-history indicator calculations when incremental calculations are correct and tested.
4. Cache only with clear keys, TTL, invalidation and data-freshness semantics. Never let caching bypass closed-candle or risk validation.
5. Add appropriate database indexes after examining query plans and data volume; use migrations and measure the impact.
6. Ensure long-running research work does not block latency-sensitive decision APIs.
7. Use timeouts and cancellation where supported. Stop abandoned work when the caller disconnects if safe.
8. Avoid introducing a heavy dependency or a new service without evidence that it is necessary.
9. Define graceful degraded states when the database, provider or research subsystem is unavailable.
10. Set measurable performance budgets based on observed baselines and expected local hardware. Do not invent benchmark results.
11. Investigate large frontend bundles and split code by route or feature only when it is safe and supported by measurements.
12. Ensure logging and telemetry have bounded volume and redact sensitive values.

## Required tests

- bounded history and pagination;
- research concurrency limits;
- provider outage without retry storm;
- cancellation and graceful shutdown;
- representative load test where tooling is available;
- no material regression in decision correctness after optimization.

**Acceptance gate:** resource usage is bounded, failures are contained and performance claims are backed by measured results.

---

# 17. Stage 14 — Regression Suite, Migration Safety and Deployment Readiness (P0/P1)

## Objective

Convert the above requirements into repeatable regression protection and a deployment process that does not destroy existing state.

## Requirements

1. Review the current test suite before adding tests. Reuse test fixtures and utilities where appropriate.
2. Add unit tests for pure logic, integration tests for database/API boundaries, and end-to-end tests for critical user flows where the repository's tooling supports them.
3. Use deterministic synthetic fixtures only inside tests. Make test fixtures explicit and prevent them from being selected by runtime providers.
4. Add property-based or invariant tests where they materially improve confidence for candle validation, risk calculations, state transitions and accounting.
5. Run all applicable existing checks: typecheck, lint, unit tests, integration tests, build, migration checks and secret scanning using the repository's actual scripts and available services.
6. Do not skip a failing test, weaken an assertion or delete a test merely to make the suite green. If a test is invalid, explain the reason and replace it with a better test.
7. Keep tests for unconfigured external services separate and clearly report them as not run or blocked.
8. Test migrations against a disposable database matching the supported database version. Do not run destructive experiments against a user's real database.
9. Inspect every migration for lock duration, data preservation, rollback/recovery implications and compatibility with currently deployed application code.
10. Use expand/migrate/contract patterns for breaking schema changes where needed.
11. Verify environment-variable validation and ensure no secret values are printed.
12. Inspect production build output for accidental server-only modules or privileged environment values in frontend bundles.
13. Review dependency and lockfile changes.
14. Produce a final report separating:
    - implemented and tested;
    - implemented but only partially tested;
    - not implemented;
    - blocked by unavailable database, credentials or external services;
    - known risks and follow-up actions.

**Acceptance gate:** all feasible automated checks pass, blocked checks are explicitly documented, and migrations are verified safely before deployment.

---

# 18. Required Implementation Workflow

Follow this workflow throughout the project:

1. **Inspect:** understand existing code, data model and call paths.
2. **Prove:** reproduce the defect or demonstrate the missing control.
3. **Plan:** describe the smallest safe change and affected modules.
4. **Implement:** make one coherent change at a time.
5. **Test:** add regression coverage before declaring the change complete.
6. **Verify:** run targeted tests and the broader relevant suite.
7. **Review:** inspect diffs, migrations, security impact and backward compatibility.
8. **Document:** update architecture docs, operational instructions and audit findings.
9. **Report:** state exact changes and observed command results.

After each stage:
- list files changed;
- explain the defect and root cause;
- explain the security/safety implications;
- report tests executed and exact outcomes;
- report blocked tests and why;
- identify any migration or configuration steps;
- stop and fix regressions before advancing.

Do not ask the user to approve every ordinary implementation detail. Make sound, conservative engineering decisions. Ask only when an irreversible action, ambiguous product requirement or credential-dependent operation genuinely requires user input.

---

# 19. Final Definition of Done

The remediation is complete only when the repository demonstrates all applicable conditions below:

- [ ] Risk checks are independent, server-side, and cannot be overridden by confidence or UI.
- [ ] Invalid, stale, malformed or forming market data cannot trigger a confirmed entry.
- [ ] No runtime fallback silently fabricates market data, trades, balances or research results.
- [ ] One approved plan can produce at most one paper execution.
- [ ] Unconfirmed, expired, rejected or risk-blocked plans produce no execution.
- [ ] Account balances, positions, fills, fees, P&L and ledger reconcile.
- [ ] Learning and strategy promotion prevent leakage and require sufficient out-of-sample evidence.
- [ ] Paper fills and metrics follow documented execution assumptions.
- [ ] Protected endpoints enforce authentication, authorization, validation and rate limits where needed.
- [ ] Privileged credentials remain server-side.
- [ ] Scheduler retries, concurrency and restarts do not duplicate or lose state changes.
- [ ] Every consequential decision has sufficient provenance for investigation and reproduction.
- [ ] Advertised instruments and timeframes correspond to real verified provider capabilities.
- [ ] Frontend status and metrics match authoritative backend state.
- [ ] Performance and queues are bounded, with graceful degradation.
- [ ] Migrations preserve existing data and have been tested safely.
- [ ] Automated checks are reported truthfully, including blocked and unverified checks.
- [ ] The system remains paper-only, with no live-trading execution path added.

A checklist item may be marked complete only with code evidence and/or a passing test or documented manual verification.

---

# 20. Required Final Report

Create or update `docs/reliability-remediation-report.md` containing:

1. Executive summary and overall status.
2. Repository commit and working-tree state at the start and end.
3. Prioritized defect list with severity and root cause.
4. Files changed and why.
5. Architecture and state-flow changes.
6. Database migrations and data-preservation analysis.
7. Security findings and remediation.
8. Tests run, exact commands, pass/fail counts and environment.
9. Checks blocked by unavailable services or credentials.
10. Remaining risks, deferred work and rationale.
11. Configuration or migration steps required from the user.
12. Safe local verification and deployment instructions.
13. A clear conclusion: ready for further paper-trading validation, not ready, or blocked.

Do not call the platform production-ready merely because code checks pass. A trading-intelligence platform needs evidence of data correctness, risk enforcement, accounting consistency, recovery behavior and research validity.

---

# 21. Start Here

Begin with **Stage 0 only**:

1. Inspect the current repository and working tree.
2. Read existing project instructions and current architecture.
3. Trace the decision-to-paper-execution path and the account/ledger path.
4. Inspect the existing tests and migrations.
5. Produce `docs/reliability-remediation-audit.md` with verified findings.
6. Run the available baseline checks and record exact results.
7. Present a concise priority plan, then continue stage by stage without weakening any safety requirement.

Do not claim to have completed the remediation before implementation and verification. Do not stop after writing an audit document unless a real blocker requires user input. After Stage 0, proceed through the stages in order, fixing P0 risks first.
