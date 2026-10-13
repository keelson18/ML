# High-priority reliability remediation report

**Date:** 2026-10-13  
**Status:** This report covers the committed remediation at `33cdfdf` and the current uncommitted follow-up work. Local code checks pass as recorded below; database/provider/deployment verification remains incomplete.
**Conclusion:** **Not ready for paper-trading validation against a real Supabase account.** The new research workflow is locally testable, but the migration has not been run against a disposable database and there is no evidence that promotion criteria or table ACLs work in PostgreSQL. Do not enable autopilot until DB and provider verification are complete.

## Repository state

- Previous remediation started at `0dd94aa` and was committed as `33cdfdf` (`feat: Add high-priority reliability remediation report and update package name`). This follow-up started at `33cdfdf` with a clean worktree.
- The package name change and three prompt documents are part of `33cdfdf`; they are not uncommitted or unattributed changes.
- At the end of this follow-up, `HEAD` remains `33cdfdf`; the files listed by `git status --short` are uncommitted implementation and report updates. No commit was created in this task.
- The complete Stage 0 system map, risk register, ordered plan and baseline results are in [reliability-remediation-audit.md](reliability-remediation-audit.md).

## Findings and remediation

| Severity | Defect / root cause | Remediation and status |
| --- | --- | --- |
| P0 | Risk mark fallback treated a missing mark as entry price; autopilot only marked the candidate symbol, so losses in other open positions could be omitted from equity/drawdown. | `markToMarket` now exposes missing marks; position sizing rejects non-finite/negative inputs and wrong-side stops; autopilot fetches fresh boundary-verified closed marks for all other open symbols and rejects entry when coverage is incomplete. Implemented and unit-tested. |
| P1 | Manual paper close used the last returned 1m candle without checking provider stale state or candle closure. | Manual close now requires a fresh, closed candle within the configured age bound. Stale and forming candles leave the position unchanged. Implemented and regression-tested. |
| P0 | Legacy `executeDecision` ignored the decision stages (`setup not evaluated`, `entry unconfirmed`, final `NO_TRADE`) and could open a position directly. No production caller existed; tests were its only call sites. | Removed the direct execution path. Opening now follows stored plan → closed-candle trigger → entry gates → pending order → later-candle fill → paper simulator → versioned account RPC. A retry test verifies a repeated processed candle does not create another fill. |
| P1 | Uncalibrated model probability influenced confidence despite the explanation saying it was neutralized. | Uncalibrated model factor is now neutral; hard risk failure still forces confidence to zero. Added regression tests. |
| P1 | Corrected provider OHLCV at the same timestamps retained the same dataset identity. | Normalized-candle SHA-256 content digest now participates in the `dataVersion` and dataset ID, including limited slices. Added correction regression. |
| P1 | Risk Management duplicated server risk limits and computed cost-basis metrics; Portfolio substituted entry prices and showed zero unrealized P&L when marks were absent. | Risk page now uses authenticated server overview and configured thresholds. Portfolio consumes canonical backend candles, surfaces stale marks, and hides equity/P&L when a mark is absent. |
| P1 | Research records were drafts and supplied evidence was not bound to a reproducible replay. | Added a server-fetched chronological replay workflow with provider candle snapshots, code/config/engine versions, transaction costs, a later holdout, seeded random and buy/hold baselines, append-only run evidence, single-use holdout claims and admin-only DB promotion gate. Promotion still requires future post-registration evidence meeting configured trade and duration minima. SQL execution and actual promotion remain NOT-VERIFIED. |
| P1 | No database-wide scheduler lease was found; locks are process-local. | Documented as a deployment risk. Same-process request ordering, account queues, CAS and candle checkpoints exist; multi-replica behavior was not verified. No migration was added without evidence of the deployment topology. |
| P2 | Paper fill assumptions were not fully described where results are presented. | `docs/RESEARCH.md` now documents spot-long, next-candle all-or-none entries, gaps, fees/slippage, stop-first bar ordering and proportional fee allocation. |

The scheduler already fetched/processed management before triggers and planner work. I extracted its provider ordering into a testable helper and added an explicit regression (`management → triggers → planner`). No change claims measured production cycle time.

## Files changed

The committed remediation file inventory remains in the original section below. This follow-up's uncommitted changed files are:

- `.env.example`
- `backend/src/routes/learning-research.test.ts`
- `backend/src/routes/learning-research.ts`
- `backend/src/services/paperTradingService.test.ts`
- `backend/src/services/paperTradingService.ts`
- `backend/src/trader/replay.test.ts`
- `backend/src/trader/replay.ts`
- `backend/src/trader/research-run.test.ts`
- `backend/src/trader/research-run.ts`
- `docs/DB_APPLY.md`
- `docs/DB_MAP.md`
- `docs/MIGRATIONS.md`
- `docs/RESEARCH.md`
- `docs/VERIFICATION.md`
- `docs/decision-learning-audit.md`
- `docs/reliability-remediation-report.md`
- `scripts/verify-schema.sql`
- `supabase/migrations/20261018000000_immutable_research_runs.sql`
- `supabase/tests/research_governance.test.sql`

- `backend/src/trader/risk.ts` — expose incomplete mark coverage and validate sizing inputs/direction.
- `backend/src/trader/risk.test.ts` — malformed sizing and missing mark regressions.
- `backend/src/services/paperTradingService.ts` — require fresh marks for all open positions, validate manual close price, remove the legacy direct executor.
- `backend/src/services/paperTradingService.test.ts` — stale/forming close refusal and plan retry idempotency; remove tests for unsupported direct execution.
- `backend/src/trader/decision-ledger.test.ts` — profitable/losing fees, partial exits, duplicate close and corrupted account reconciliation checks.
- `backend/src/engines/confidence-engine.ts` — neutralize uncalibrated probability contribution.
- `backend/src/engines/confidence-engine.test.ts` — confidence calibration and hard-risk regressions.
- `backend/src/services/marketDataService.ts` — fingerprint normalized candle content in dataset identity.
- `backend/src/services/marketDataService.test.ts` — same-range provider correction regression.
- `backend/src/autonomy/paper-autopilot.ts` — make provider-series priority explicit/testable.
- `backend/src/autonomy/paper-autopilot.test.ts` — management-first ordering test.
- `backend/src/routes/trader.ts` — return server-configured risk limits and gross exposure in overview.
- `src/lib/backend-api.ts` — type the new overview fields.
- `src/components/pages/RiskManagement.tsx` — consume server metrics/limits and show stale-mark warnings.
- `src/components/pages/PortfolioPage.tsx` — use canonical backend data and avoid presenting unavailable marks as P&L/equity.
- `docs/RESEARCH.md` — document paper simulator assumptions.
- `docs/reliability-remediation-audit.md` — Stage 0 audit, staged findings and per-stage reports.
- `docs/reliability-remediation-report.md` — this final report.

No SQL migration was changed. No hosted database was contacted and no user data was modified.

## Verification results

Final checks, run in this workspace:

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS, exit 0 |
| `npm run backend:typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, exit 0 |
| `npm test` | PASS: 60 test files, 339 tests |
| `npm run build` | PASS: Vite transformed 1,615 modules and built successfully. Warning: one JS chunk is 922.48 kB uncompressed (186.42 kB gzip). Sandbox run first failed with esbuild `spawn EPERM`; elevated rerun passed. |
| `npm run check:env` | PASS: 53 application environment reads documented |
| `npm run check:migration-versions` | PASS: 42 migration files, unique versions |
| `npx vitest run scripts/vite-env-safety.test.ts` | PASS: 1 file, 4 tests (elevated rerun required after sandbox startup `spawn EPERM`) |
| `git diff --check` | PASS after removing extra trailing blank lines; Git reports only line-ending normalization warnings for three files. |

Baseline `npm test` had 320/321 tests pass; the import-boundary test timed out at 5 seconds while several resource-heavy checks were launched together. Running it alone passed, and the final serial full suite passed all tests.

## Blocked and not verified

- `supabase`, `psql` and `docker` were unavailable. `supabase test db`, ledger SQL triggers, deployed migration history, grants/RLS, two-session concurrent updates and backup/restore were not verified.
- No Supabase project, provider credentials or authenticated browser session were used. Live provider entitlements, delayed/realtime semantics, current symbol coverage, candles, MFA assurance and API-to-DB operation remain NOT-VERIFIED.
- The research run/promotion workflow is implemented in source, but database execution and an eligible post-registration out-of-sample result have not been verified. No effectiveness or out-of-sample success is claimed.
- No multi-replica scheduler test or provider-backed timing measurement was possible.
- Frontend pages passed TypeScript/build/lint but received no authenticated browser smoke test.

## Owner verification steps

1. Back up existing paper account data and compare repository migration IDs with the target Supabase migration history before applying anything.
2. Apply pending migrations through the project's established migration process; run `scripts/verify-schema.sql` and `supabase test db` against a disposable/local database first.
3. Confirm process liveness at public `/health`; confirm schema status via authenticated `/api/v1/me/health` or admin `/api/v1/system/health`, then compare ledger hash verification and accounting reconciliation.
4. Probe each intended provider/symbol/timeframe using configured credentials; confirm provider plan semantics and data freshness.
5. Keep autopilot disabled until database migration/grants, fresh marks, and scheduler ownership are verified. Then use one symbol on the owner's paper account and compare Trader Desk marks, accounting identity, hash-chain status and `/health` output.

No migration or local Supabase database step was performed in this remediation session.
