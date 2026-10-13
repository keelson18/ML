# Decision and Learning Fix Work Order

Implementation started 2026-10-13 after reading the attached master prompt in full. Branch `main`; initial HEAD `73e0e2d56bb197750859f7f81610b07e70460566`. The initial working tree was already dirty, including Admin health, auth, provider-budget, market-data, live-feed, schema-verification, and UI changes. Those changes were preserved; this report describes this work order's additions/edits, not the pre-existing owner changes.

## Decision and learning flow

The actionable path is `POST /api/v1/decisions/analyze` → configured market-data provider/cache → shared closed-candle selector → `decisionService` → master decision engine and data, strategy, risk, portfolio, contradiction, and confidence checks. Autopilot has a separate replay path through `AutonomousPipeline`; the dashboard's local indicators are context only. Learning/research records are authenticated, user-scoped workflow data and do not promote production strategies.

## Confirmed defects addressed

- Candle closure and provider provenance were dropped before decision analysis; unknown/degraded data could reach action logic. Engine context now carries closure, state, provider/fetch/dataset and market type. Decision API now selects closed candles using the shared candle clock/grace setting, and unknown/stale/unverified inputs fail closed.
- Detector exceptions were silently discarded. Diagnostic strategy runners retain generic failure details; strategy analysis reports degraded status and detector warnings.
- Strategy chosen for display could differ from the strategy whose signal drove the action. Decision voting now uses the selected strategy's signal. The action's levels are drawn from the same risk proposal that passed the gate; fabricated ATR fallback levels were removed.
- Correlated evidence could inflate independence/confidence. Confidence evidence is grouped by correlation group and blocked data degrades confidence status.
- Research reported out-of-sample readiness without running a backtest. It now explicitly returns insufficient evidence / invalid design, zero sample and zero confidence until a real evaluator/report is wired.
- Learning booleans could produce validated/approved stages without evidence. The learning engine now requires a structured evidence report and acceptance checks; production mutation remains disabled. Authenticated research/learning endpoints persist only draft/hypothesis records and do not accept client status or user identity.
- Browser decision requests previously sent candles that the backend route rejects. They now send symbol/timeframe only and the server fetches canonical data. Added a request-contract test.
- Dashboard exposed a manual paper-execution action even though the server disables it and the requested system is paper-only/automatic. Removed the manual control/helper and removed unapproved local ATR levels from the chart overlay.

## Tests added or expanded

- Engine tests reproduce unknown closure gating, strategy detector failure visibility, selected-strategy vote binding, same-risk-proposal levels, correlated evidence grouping, unsupported learning validation, zero-trade research readiness, and market-session gap handling.
- Decision route tests cover closed-candle/provider metadata forwarding and cache-quota behavior.
- Learning/research route tests cover authenticated draft/hypothesis persistence and rejected unsafe payloads.
- Frontend API test ensures decision requests contain only server-owned symbol/timeframe input.

Fixtures are synthetic and labeled in tests; no market data or outcomes were fabricated as production facts.

## Verification

`npm ci` eventually succeeded after resolving the Windows esbuild file lock and running the install with required process permissions. It installed 370 packages; npm reported 8 advisories (2 moderate, 6 high). No automatic dependency changes were made.

Final focused run: `npx vitest run src/lib/backend-api.test.ts backend/src/engines/market-structure-engine.test.ts backend/src/routes/decisions.test.ts backend/src/routes/learning-research.test.ts` — PASS, 4 files, 53 tests. Final full run: `npm test` — PASS, 56 files / 313 tests. `npm run typecheck`, `npm run backend:typecheck`, and `npm run lint` — PASS. `npm run build` — PASS after the sandboxed run failed with esbuild `spawn EPERM` and the elevated retry was approved; Vite transformed 1,614 modules and warned that `App` is 920.36 kB (>500 kB). `npm run check:env` — PASS, 52 variables documented. `npm run check:migration-versions` — PASS, 40 unique versions. `git diff --check` — PASS with CRLF normalization warnings.

## Remaining limitations / not verified

- Research still does not invoke the existing replay/backtest engine to produce trade/outcome metrics, cost-adjusted validation, minimum sample checks, or rollbackable promotion evidence. It fails closed rather than making a readiness claim. Full Stage 5 research/promotion is therefore incomplete.
- Production Supabase schema, grants, provider availability, configured live market coverage, real session calendars, and persisted-account restart/replay behavior were not exercised against the owner's environment. No production data was changed.
- Non-crypto discontinuities are labeled as possible scheduled market-session gaps because instrument calendars are not part of the provider contract; market-session correctness remains unverified.
- Full prompt coverage should not be inferred solely from passing unit/build checks; see command results in the final response for any incomplete stages.


## Follow-up concern work (2026-10-13)

- Decision analysis now reports `marketBias` separately from setup detection, entry confirmation, risk capacity, and final action. A strategy signal alone can no longer produce BUY/SELL from the master decision endpoint; without a planner-validated setup and executor-confirmed closed-bar trigger, final action remains NO_TRADE and no entry/stop/target is published.
- Candle boundary logic is shared with the browser. Dashboard initialization, Strategy Lab and backtesting now receive boundary-closed candles rather than dropping the last array row. The autonomy pipeline always rechecks the boundary; scheduler callers cannot bypass it. Paper plan execution also checks the candle boundary immediately before processing.
- Replay order IDs now derive from dataset, plan and bar identity. Repeat-run tests compare the complete replay output for equality.
- Learning evidence must meet configured forward trade-count and test-window minima and show positive expectancy, profit factor above one, costs, and non-negative drawdown. It still does not enable production mutation.
- Migration `20261017000000_health_empty_and_uncheckpointed_ledger.sql` changes hash-chain health so empty databases/accounts remain unverified and accounts without checkpoints receive a full verification before checkpointing. Verification uses the same per-account advisory lock as account writes.
- `supabase/tests/ledger_health.test.sql` covers empty ledgers, event retries, stale account versions, empty-account health and privileged hash corruption. It is designed for `supabase test db`; it was NOT-VERIFIED here because `supabase`, `psql`, and Docker are not installed. Hosted Supabase state and concurrent two-session execution remain NOT-VERIFIED.

### Follow-up verification status

- `npm test` — PASS on final tree, 58 files / 321 tests. An earlier run performed alongside other CPU-heavy checks hit the existing import-boundary test's 5-second timeout; that test passed alone and the serialized full rerun passed.
- `npm run typecheck` — PASS.
- `npm run backend:typecheck` — PASS.
- `npm run lint` — PASS.
- `npm run build` — PASS after elevated retry for sandbox esbuild `spawn EPERM`; 1,615 modules transformed. Vite reports the `App` chunk at 921.69 kB (>500 kB advisory limit).
- `npm run check:migration-versions` — PASS, 41 unique migration versions.
- `npm run check:env` — PASS, 52 environment variables documented.
- `git diff --check` — PASS with CRLF normalization warnings.
- `supabase/tests/ledger_health.test.sql` and hosted Supabase schema/ledger/accounting state — NOT-VERIFIED. The environment has no `supabase`, `psql`, or Docker executable. Concurrent two-session database verification also remains NOT-VERIFIED.
- Replay determinism is verified by unit tests on synthetic fixtures only. No claim is made about real trading effectiveness or actual production learning.
