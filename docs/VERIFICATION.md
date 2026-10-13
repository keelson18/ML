# Verification record

This file reports evidence observed in the repository and this workspace session. A passing unit test does not prove a deployed Supabase migration, provider key, live market feed, or production configuration. `NOT-VERIFIED` means the required environment or manual check was unavailable; it is not a pass.

## Phases 0–11 evidence

| Requirement | Status | Evidence / check |
| --- | --- | --- |
| Market-data cache refetches after TTL | PASS | `backend/src/services/marketDataService.test.ts` — `refetches after the timeframe TTL expires`; mocked provider fetch was called twice after the 1h TTL. |
| Stale fallback has a bounded age | PASS | Same test file — `serves an expired result as stale only while within the configured age bound` and `throws when provider failure occurs after the stale age bound`. |
| Stale market data cannot open entries | PASS | `backend/src/services/paperTradingService.test.ts` — `rejects new positions when market data is stale`; planner/scheduler entry paths also test stale flags in `backend/src/autonomy/pipeline.ts` and `backend/src/routes/trader.ts`. |
| Helmet and rate limiting are registered once; health and 429 behavior | PASS | `backend/src/server.ts` registers each plugin once. `backend/src/server.test.ts` — `builds and serves health with standard security headers` (200), `rate limits authenticated market requests using configured quota` (429). Route-level 429 behavior is also covered in `backend/src/routes/market.test.ts`. |
| No runtime USDT-to-USD symbol substitution | NOT-VERIFIED (source correction made) | Runtime legacy aliases have been removed from `src/lib/markets.ts`; `getMarket('BTCUSDT')` is now an unknown symbol, and focused tests assert rejection. The latest test suite could not run because dependencies are incomplete. Generic engine fixtures still use BTCUSDT as an unregistered test label; no production provider mapping was found. |
| Market availability is shown per symbol; unavailable symbols are hidden/rejected | PASS (implementation only) | `src/lib/markets.ts` filters `unavailable` symbols from selectors; `backend/src/services/paperTradingService.ts` rejects unverified/unavailable markets. `AdminPanel` shows `available` / `unavailable` / `unverified`. |
| Which Massive markets were actually verified in this session | NOT-VERIFIED | No authenticated provider probe was run and no live provider key/result was available. **Verified by this session: none.** Prior rate-limit evidence exists for multiple candle endpoints; it is not proof of ticker availability. |
| A plan cannot fill on its creation candle | PASS | `backend/src/trader/executor.test.ts` — `creates a pending order after a trigger and cannot fill it on that candle`; the new `rejects a pending fill when the current entry gate blocks it` test covers the later-fill gate. |
| Position size is stop-risk based; equivalent uncapped risk across stop distances; equity is marked to market | PASS | `backend/src/trader/risk.test.ts` — `risks the same cash amount across narrow and wide stops when uncapped`, `includes unrealized losses in mark-to-market drawdown`. |
| Break-even, partials, trailing, time stop, invalidation have tests | PASS | `backend/src/trader/manager.test.ts` covers target partials plus break-even, trailing without loosening, time-stop, thesis invalidation, and stop-first ordering. |
| Scheduler close grace, incomplete candles, and bounded catch-up | PASS | `backend/src/autonomy/candle-clock.test.ts` — incomplete-candle grace and aligned UTC boundaries; `backend/src/autonomy/scheduler.ts` limits executor catch-up to `MAX_ENTRY_AGE_BARS` and runs the pipeline on closed prefixes. A live scheduler run was not performed. |
| Catch-up never opens an entry from stale candles | PASS (code path; no scheduler integration test) | `backend/src/autonomy/scheduler.ts` pauses on `series.stale`; `backend/src/autonomy/pipeline.ts` rejects stale executor/planner data and too-old entry candles. Unit-level integration evidence is less complete than the claim; add a scheduler-to-executor test before release. |
| Every closed trade has a journal row with R, MAE, MFE, engine and dataset versions | PASS (paper-account journal) | `backend/src/services/paperTradingService.ts` appends to `tradeJournal` in the versioned, owner-scoped `paper_sim_accounts.state`; the row records R, `maeR`, `mfeR`, dataset ID and engine versions. `backend/src/services/paperTradingService.test.ts` asserts journal metrics on manager-driven closes; `backend/src/engines/market-structure-engine.test.ts` covers close-path excursions. Caveat: normalized `trade_journal` SQL-table writes are not synchronized by current code; verify whether that separate table is a release requirement. |
| Research honesty rules: paper vs live, sample size, baselines, forward test | PASS | `docs/RESEARCH.md` describes simulated-vs-live limitations, sample-size gating, confidence intervals, buy-and-hold/random/cash baselines, and locked forward testing. |

## Phase A — empty and malformed HTTP responses

**PASS for safe parsing and error mapping; NOT-VERIFIED for visual browser behavior.** `shared/http.ts:1` reads response text once and safely parses JSON. The frontend and Supabase Edge Function provider clients use this helper; the server provider/health boundaries were also updated. Content searches found no direct `response.json()` calls in `src/` or `supabase/functions/`.

`src/lib/backend-api.test.ts` contains these named cases (8 tests): empty 200 produces a clear error; empty 500 and HTML 502 produce the unreachable-backend message; JSON 400 preserves the backend error; valid JSON parses; empty and JSON 401 preserve status/backend authentication handling; a bodyless POST omits the JSON content-type header. The retry control was already present on Dashboard and is retained. Dashboard candle state is cached by symbol/timeframe and kept on fetch failure with a stale badge.

The app preview screenshot facility returned “Screenshot capture not available from the app.” The retry and stale-badge flow was therefore not manually exercised in a browser during this session.

## Phase C — news and event risk

- **Manual blackouts and executor:** PASS at code/unit-test level. `backend/src/trader/event-risk.test.ts` verifies fail-closed behavior, impact thresholds, and active IDs. `backend/src/trader/executor.test.ts` verifies a touched pending fill is rejected when the current gate blocks. `supabase/migrations/20261011000000_manual_event_blackouts.sql` defines owner/admin controls through `is_current_user_admin()`-checked RPCs and writes admin audit events. The migration has not been applied or exercised against a Supabase project in this session (NOT-VERIFIED deployment).
- **Management during an entry blackout:** position management remains a separate path in `backend/src/services/paperTradingService.ts` / `backend/src/routes/trader.ts`; a live open-position regression test under an active blackout was not run (NOT-VERIFIED).
- **Provider status:** PASS for honest reporting only. `backend/src/news/providers.ts` reports `unverified` when no provider is configured. No provider key or provider-backed adapter/ingestion job was used in this session; provider availability is NOT-VERIFIED.
- **Ingestion/storage:** PASS for helper-level sanitization, registry symbol tagging, and `ingested_at <= asOf` filtering (`backend/src/news/providers.test.ts`). No provider ingestion was run. Database grants, immutable-ingestion trigger, and duplicate behavior have not been tested against deployed PostgreSQL (NOT-VERIFIED).
- **UI and notifications:** tabs, CMS research notes, calendar view, sentiment-unavailable copy, and notification bell are implemented. End-to-end browser delivery and the CMS publish trigger have not been exercised (NOT-VERIFIED).
- No headline or sentiment field is imported into the BUY/SELL decision engine. The decision engine inputs remain market/engine context; no news provider is wired into decision analysis. No live or authenticated provider command was run.

## Phase D — account security

- Password helper reauthenticates via `signInWithPassword` before `updateUser`; client policy requires 12 characters, upper/lowercase, a number, matching confirmation, and a five-failure/15-minute local lockout. `src/lib/account-security.test.ts` covers call order and wrong-current-password rejection (PASS in mocked tests). Supabase project password policy and deployed Auth behavior are NOT-VERIFIED.
- TOTP enrollment, QR/secret display, code verification, verified-factor listing, AAL2-gated removal, and pre-dashboard sign-in challenge use Supabase MFA APIs. Mocked tests cover enrollment/verify/removal ordering; live Supabase MFA is NOT-VERIFIED. Recovery is delegated to the owner’s Supabase dashboard; the app stores no recovery codes.
- Admin API enforcement checks AAL2 when `REQUIRE_ADMIN_MFA=true`, and otherwise requires AAL2 when the signed-in admin has a verified next-level factor. Server route tests against a deployed admin account are NOT-VERIFIED.
- “Sign out of other devices” uses `auth.signOut({ scope: 'others' })`; last sign-in time is shown when Supabase supplies it. Browser session behavior is NOT-VERIFIED.
- `GET /api/v1/me/export` rate-limits to one request per day, filters each direct dataset by the authenticated user and related rows through that user’s own account/decision IDs, excludes audit/security records, and writes an export audit record. `backend/src/services/personalDataExport.test.ts` verifies owner filters (PASS, mocked). Two-user deployed RLS isolation is NOT-VERIFIED.
- Avatar upload checks ≤2 MiB, JPEG/PNG/WebP magic bytes in the browser, uses `<uid>/...`, and relies on a private-bucket storage policy/2 MiB MIME-size limits in `20261013000000_account_security.sql`. `src/lib/account-security.test.ts` covers magic bytes and size. Deployed bucket policies and cross-user storage denial are NOT-VERIFIED.
- Account deletion remains deferred.

## RLS evidence for added tables

These SQL definitions are source evidence, not proof that production applied them:

```sql
-- Event blackout reads are admin-only; writes are via SECURITY DEFINER RPCs
-- that require auth.uid() and public.is_current_user_admin().
alter table public.event_blackouts enable row level security;
create policy event_blackouts_admin_read on public.event_blackouts
  for select to authenticated using (public.is_current_user_admin());
revoke all on public.event_blackouts from anon, authenticated;
grant select on public.event_blackouts to authenticated;

-- News/calendar items are shared authenticated read-only data; anon is denied.
create policy news_items_authenticated_read on public.news_items
  for select to authenticated using (auth.uid() is not null);
create policy news_items_admin_read on public.news_items
  for select to authenticated using (public.is_current_user_admin());
revoke all on public.news_items from anon, authenticated;
grant select on public.news_items to authenticated;

create policy calendar_events_authenticated_read on public.calendar_events
  for select to authenticated using (auth.uid() is not null);
create policy calendar_events_admin_read on public.calendar_events
  for select to authenticated using (public.is_current_user_admin());
revoke all on public.calendar_events from anon, authenticated;
grant select on public.calendar_events to authenticated;

-- Notifications are caller-owned and users may update only read_at; admins can audit-read.
create policy in_app_notifications_owner_read on public.in_app_notifications
  for select to authenticated using (auth.uid() = user_id);
create policy in_app_notifications_owner_update on public.in_app_notifications
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy in_app_notifications_admin_read on public.in_app_notifications
  for select to authenticated using (public.is_current_user_admin());
revoke all on public.in_app_notifications from anon, authenticated;
grant select, update (read_at) on public.in_app_notifications to authenticated;
```

A PostgreSQL/Supabase RLS integration test was not run, so owner/admin/anon behavior for newly added tables is **NOT-VERIFIED in a database**.

## Required manual smoke test

**Result: NOT-VERIFIED.** No signed-in browser account or confirmed live Massive market probe was available, and the preview screenshot tool was unavailable. Do not treat the steps below as completed.

1. Sign in with a test user.
2. Open a Massive crypto market and verify availability shows `available`; if not, stop and record the provider result.
3. Load candles and confirm symbol/timeframe labels and latest candle timestamps.
4. Open Trader Desk and confirm account, plans, and risk status load.
5. Refresh plans; record the scan count and any per-symbol provider errors.
6. Advance plans; confirm stale data or active event windows block entries and record the reason.
7. Open Journal & daily review; inspect one closed-trade row and verify R, MAE, MFE, engine and dataset version fields. MAE/MFE and version fields are covered by unit tests; the live row has not been inspected.
8. Open Admin → Event Risk; create a short test blackout, confirm audit history, observe the active countdown/entry block, then cancel it.
9. Sign out and verify the authentication screen returns.

## Chart performance (Phases 1–2)

- **Incremental candle updates:** PASS (unit). `src/lib/chart-feed.test.ts` verifies that live ticks use `update`, that `setData` runs only on replacement, and that identical data does nothing.
- **Overlay diffing:** PASS (unit). Overlays are keyed and updated in place; only stale keys are removed; markers are re-set only when their content changes.
- **Tick batching and throttled accessibility table:** PASS (code review only). Not measured in a browser.
- **Server-Timing and timing helpers:** PASS (unit) for formatting. The candles route's header is not exercised by a route test because the provider mock shape is not set up for a success response.
- **Frame and long-task measurement, React Profiler shell re-render check, zoom/scroll preservation:** NOT-VERIFIED (no browser access in this session).
- **Numbers and budgets:** NOT-VERIFIED. See `docs/PERF_BASELINE.md`.
- **Streaming, compression, pagination, IndexedDB, batched quotes, decision cache, Web Worker:** NOT STARTED (Phases 3–6).

## Phase E and CI

- `npm run check:env` passes in this workspace: all 47 detected environment variable reads are listed and commented in `.env.example`.
- CI workflow is present at `.github/workflows/ci.yml` and declares install, environment check, typechecks, lint, tests, build, and a non-blocking production dependency audit artifact. GitHub Actions has not run for this worktree (NOT-VERIFIED green CI).
- Final local verification (before chart work): `npm test` passed 150 tests in 31 files; after chart Phases 1–2, `npm test` passed 165 tests with 0 failures; frontend and backend typechecks passed; `npm run check:env` passed; lint exited successfully with three existing Fast Refresh warnings; production build passed with a chunk-size warning.
- `npm audit --omit=dev --json` reported 0 info/low/moderate/high/critical vulnerabilities across 88 production dependencies. CI uploads the machine-readable report without failing the job for advisory findings.
- `package.json` has no `api:dev` script and the current server is Fastify (`backend/src/server.ts`). Duplicate decision routes, parallel API clients, and legacy Supabase tables remain; cleanup is not complete. No migration was removed.

## Quantum Phases 2–3

### Full audit update — 2026-10-12

- Current source findings and remediation priorities are in [ARCHITECTURE_AUDIT.md](ARCHITECTURE_AUDIT.md). This report supersedes older audit grades and architecture claims where they describe removed paths or claim unverified production readiness.
- `node scripts/check-migration-versions.mjs`: **PASS** (39 migration files, unique numeric versions).
- `node scripts/check-env-docs.mjs`: **PASS** (47 application environment reads documented in `.env.example`).
- `git diff --check`: **PASS**.
- Supabase CLI read-only check against the currently linked project: migration `20261015000000` is recorded as applied, and `select public.verify_paper_schema()` returned `{"ok":true,"missing":[]}`. This proves the linked project’s required schema is present; it does not prove the running backend uses that same project or service-role key.
- For the reported backend RPC failure, sent `NOTIFY pgrst, 'reload schema'` to the linked project (non-destructive). Rechecked: `verify_paper_schema()` returned `ok: true`, `missing: []`, and `service_role_can_execute: true`. The backend process must be restarted and its authenticated health rechecked; if it still reports the RPC missing, its configured Supabase project differs from this linked project or has a different REST endpoint configuration.
- Current `npm ci`: **FAIL** — `EPERM` on unlink of `node_modules/@esbuild/win32-x64/esbuild.exe`. Elevated retry produced the same error. The prior four requested checks could not start: frontend/backend typecheck report `tsc` not recognized; lint reports `eslint` not recognized; tests report `vitest` not recognized.
- Provider identity/timezone behavior, public health access control, UI/research alignment, database state, live provider availability, RLS behavior, and browser/scheduler behavior: **NOT-VERIFIED** beyond the source findings in the audit.

- The append-only event ledger, deterministic hash-chain RPCs, atomic versioned account update, relational fill/shadow projections, scheduled snapshots and schema check are in `supabase/migrations/20261015000000_quantum_paper_core.sql`. It is not applied remotely; PostgreSQL execution, RLS, concurrency and backfill remain **NOT-VERIFIED**. It includes a statement-level BEFORE TRUNCATE guard. The chain detects tampering by actors unable to rewrite all rows, not a database owner who can rebuild the chain.
- Shared paper fill/exit accounting and calendar-aware candle math have unit tests. Tests for hash tampering, 1,000 simulated trades, fetch-once deduplication, chronological bounded replay, stale-entry age, and quota-derived request spacing are present. The requested unit suite is **NOT-VERIFIED** because `npm ci` fails and `vitest` is unavailable.
- The per-user scheduler, opt-in enrollment, authenticated rate-limited Run now route, paused-reason path, 5-minute management replay, selected-symbol refresh, and process-local shared fetch/cache path are implemented. Browser behavior and a deployed scheduled run are **NOT-VERIFIED**. Run one scheduler worker per project; multi-replica coordination is not implemented.
- `/health` reports `schema.ok/missing`, hash-chain status and TS accounting reconciliation. Trader Desk labels these separately as hash-chain tamper evidence and accounting identity. Neither has been checked against a live Supabase project (**NOT-VERIFIED**).
- `paper_sim_accounts` direct writes are revoked from `authenticated` and `service_role`; application writes use `record_paper_account_update`, while direct accesses found in export and account loading are reads. The original migration first granted authenticated `INSERT, UPDATE`; owner: check production grants/history in SQL. If authenticated had those write grants, that was an integrity hole closed by the new revocation.
- Check current grants with `select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='paper_sim_accounts';`. Before migration history and grants are checked, prior production exposure is **NOT-VERIFIED**.
- The DB symbol caps are in `autopilot_settings`; changes require the admin and MFA gate and create an audit event. Symbols are checked against active registry rows and provider availability in backend. `POLUSD` is only selectable when its availability is `available`.
- `node scripts/measure-paper-ledger.mjs` reports a scripted 3-symbol, 1-position, 24-hour estimate of 864 rows / 341,187 JSON payload bytes for checkpoint snapshots versus 865 rows / 167,919 bytes for an initial snapshot plus 864 decision events. These are model payload bytes, excluding PostgreSQL overhead. See `docs/AUTOPILOT_BUDGET.md`.
- `npm run check:migration-versions`: **PASS** (39 files, unique numeric prefixes). `npm run check:env`: **PASS** (47 environment variables documented). `node scripts/measure-paper-ledger.mjs`: **PASS** (reproduces the figures above).
- Requested local checks: `npm ci` **FAIL** (`EPERM` unlink of `node_modules/@rollup/rollup-win32-x64-msvc/rollup.win32-x64-msvc.node`); `npm run typecheck` **FAIL** (`tsc` not recognized); `npm run backend:typecheck` **FAIL** (`tsc` not recognized); `npm run lint` **FAIL** (`eslint` not recognized); `npm test` **FAIL** (`vitest` not recognized). The four project checks could not execute until `npm ci` can replace the locked Rollup binary. These results do not establish that source checks pass.

### Current workspace follow-up — 2026-10-12

- `npm ci`: **FAIL** — `EPERM` unlinking `node_modules/@esbuild/.win32-x64-WRe5TuS/esbuild.exe` (`errno -4048`). An elevated retry in this session previously produced the same class of lock error. Stopping the development process started in this session did not release it.
- Dependency recovery with `npm install --ignore-scripts`: **FAIL** — `EBUSY` copying `node_modules/@esbuild/win32-x64/esbuild.exe` to the temporary install directory. `node_modules` is incomplete after the failed clean install; do not treat global tools or this partial tree as a reproducible dependency install.
- `npm run typecheck`, `npm run backend:typecheck`, and `npm run lint`: **PASS** before the later failed `npm ci`; the backend compile issue (`MIN_CANDLES` undefined) was fixed by declaring the 60 closed-candle minimum. These checks must be rerun after dependencies are restored.
- `npm run build`: **PASS** before the later failed `npm ci`, with the existing large-chunk warning. Must be rerun after restoring dependencies.
- `npm test`: **NOT-VERIFIED** — Vitest was absent after the failed install, so the command could not start (`'vitest' is not recognized`).
- Database readiness, live provider candles, stream availability, and authenticated page workflows: **NOT-VERIFIED** against the owner’s deployed Supabase/provider accounts. `/health` previously reported missing `verify_paper_schema`; a candle probe returned an empty series on one request and provider rate limiting on later requests.

### Final local follow-up — 2026-10-12

- `npm ci`: initial sandbox run **FAIL** (`EPERM`, `spawn` while rebuilding packages, with cleanup `EPERM` under `node_modules`). After the owner stopped the pre-existing esbuild process, elevated `npm ci` **PASS** (370 packages installed). It reported 8 dependency vulnerabilities (2 moderate, 6 high); no automatic audit fix was applied.
- `npm run typecheck`: **PASS**.
- `npm run backend:typecheck`: **PASS**.
- `npm run lint`: **PASS**.
- `npm test`: **PASS**, 51 test files and 280 tests. The sandbox invocation initially failed to spawn esbuild (`EPERM`); the elevated run succeeded. Test fixtures now return provider instrument metadata matching the requested source ticker, and autopilot defaults are derived from the active registry.
- `git diff --check`: **PASS**.
- Live API/provider/Supabase access and browser page workflows remain **NOT-VERIFIED** in this local run. The local automated checks do not prove that the owner’s backend is running or that its database migrations and provider credentials are ready.

### Admin System Health — Phase 1

- Aggregated admin overview, strict response validation, process-local provider/feed snapshots, cached candle freshness, environment label, and server-side TTL are implemented. Sources that throw or lack evidence return `unverified`; provider requests are not made by the overview.
- Migration `20261016000000_admin_health_checkpoints.sql` adds a service-role-only per-account sequence/hash checkpoint and changes normal ledger health to verify only new rows. Full ledger re-verification is an explicit AAL2-gated, one-per-minute action; its success audit is part of the database transaction, and MFA denials are audited. Migration application and database execution are **NOT-VERIFIED**.
- `npm run check:env`: **PASS** (52 environment reads documented). `npm run check:migration-versions`: **PASS** (40 unique versions).
- `npm run typecheck`: **FAIL / BLOCKED** because this workspace's dependencies are incomplete (`react` and `lucide-react` are unavailable); no successful frontend typecheck was established.
- `npm run backend:typecheck`: **FAIL / BLOCKED** because this workspace's dependencies are incomplete (`zod`, `fastify`, and `vitest` are unavailable). One surfaced diagnostics type mismatch was corrected; compilation remains unverified.
- Phase 1 route/security tests were added but **NOT-VERIFIED** because Vitest cannot be loaded. Browser behavior, live Supabase schema, provider budget state, feed connectivity, and authenticated AAL2 re-verification remain **NOT-VERIFIED**.

## Research and reliability follow-up — 2026-10-13

This follow-up supersedes older research status claims above. It records source and automated-test state only; it does not imply database application or trading effectiveness.

- Supported stored-plan regression tests cover unavailable markets, spot-only short rejection, daily trade caps and replay rejection of same-symbol competing plans. Full suite: **PASS**, `npm test` — 60 files, 339 tests.
- Research now fetches provider-owned candles server-side, snapshots trigger/4h/1d series and provenance, replays chronologically with explicit fee/slippage, calculates untouched holdout metrics and seeded baselines, and persists evidence through service-only `record_research_run`. Admin promotion is gated by the stored server result. Research fixtures are synthetic and do not establish effectiveness.
- The replay's former unconditional quantity-one gate is replaced with shared paper sizing plus spot-only, duplicate-symbol, concurrent-position and daily-entry gates. Focused replay/research/paper tests: **PASS**, 4 files, 19 tests.
- `npm ci`: sandbox **FAIL** (`spawn EPERM`); elevated retry **PASS**, 370 packages installed; npm reported 8 advisories (2 moderate, 6 high).
- `npm run typecheck`: **PASS**. `npm run backend:typecheck`: **PASS**. `npm run check:env`: **PASS**, 53 variables. `npm run check:migration-versions`: **PASS**, 42 unique migration files. `npm test`: **PASS**, 60 files / 339 tests. `npm run build`: sandbox **FAIL** (`esbuild` `spawn EPERM`); elevated retry **PASS**, 1,615 modules, with existing `App` chunk warning at 922.48 kB. `npm run lint`: first run **FAIL** for an unused test fixture constant; removed, final rerun pending. `git diff --check`: pending.
- Research migration: `20261018000000_immutable_research_runs.sql`. The version checker caught and corrected an initial collision with `20261017000000_health_empty_and_uncheckpointed_ledger.sql`.
- Local DB integration: **NOT-VERIFIED**. `supabase`, `psql`, and Docker are unavailable; pgTAP was not executed. No hosted database was contacted or modified. Migration SQL, RLS, idempotency, concurrency and promotion behavior remain unverified.
- Scheduler topology: **NOT-VERIFIED**; owner is unsure whether multiple backend scheduler instances can run. No distributed lease was added without deployment evidence. One-worker ownership remains an operational assumption.
- Authenticated UI/provider-to-paper-fill validation: **NOT-VERIFIED**. Automated fixtures do not replace an end-to-end paper account check.

Follow-up began at `33cdfdf678a7416e203c123c4746317c82884c1f` with a clean worktree. No commit was created. Exact changed files are listed by final `git status --short`.


Correction to the verification summary above: final `npm run lint` and `git diff --check` **PASS** (only line-ending normalization warnings). The isolated full `npm test` rerun **PASS**, 60 files / 339 tests; the parallel run's sole 5-second timeout was the import-boundary test. Final backend typecheck, focused 4-file / 19-test run, and unique migration version check also passed after the replay risk-gate update.

Local database retry details: sandbox `npx supabase test db` could not fetch the CLI because npm cache-only mode had no cached package. Elevated `npx --yes supabase test db` ran the CLI but failed to connect to local PostgreSQL at `127.0.0.1:54322` (`ECONNREFUSED`). Elevated `npx --yes supabase start` confirmed the blocker: `docker: command not found (podman also not found)`. The research pgTAP contract and migrations therefore still have **NOT-VERIFIED** execution status. The schema verifier and operator inventory now also require `research_approvals`, which the promotion RPC writes.

### Holdout and research reliability follow-up — 2026-10-13

This is the latest workspace evidence and supersedes older test counts above. Starting revision: `09d3b86abe0fe0e74171d847108fb4c64e3f7f13` on `main`, matching `origin/main`; worktree was clean at inspection. No commit was created. The changes below are local and uncommitted.

- Added migration `20261019000000_reject_overlapping_research_holdouts.sql`: a transaction advisory lock serializes holdout claims by symbol/timeframe and a trigger rejects intersecting half-open intervals, while allowing adjacent windows. The schema verifier now requires this function and trigger.
- Added migration `20261020000000_research_holdout_registration_window.sql`: experiment parameters and registration time must include an immutable future `testStartTime`; direct owner draft updates are removed so a client cannot retune a registered boundary. The schema verifier requires the registration guard.
- Expanded SQL contracts for overlapping and adjacent intervals, concurrent advisory-lock serialization, fixed registration time/parameters, authenticated write restrictions, and schema checks. Added a local-only two-session PostgreSQL concurrency runner. It checks that the second backend is waiting on the advisory lock before committing the first transaction and refuses non-local or non-54322 database URLs.
- Research run requests keep one registered future boundary and return `202 collecting` without persisting partial outcome metrics until the configured forward-day and trade thresholds are reached. Requests whose fixed boundary falls outside retained provider history fail closed; the boundary is never moved. The provider history cap can make 90-day evidence infeasible on short timeframes, which the route rejects.
- `npm ci`: **PASS**, 383 packages installed after adding the `pg` test dependency; npm reported 8 advisories (2 moderate, 6 high). No automatic audit fix was run.
- `npm run typecheck`: **PASS**. `npm run backend:typecheck`: **PASS**. `npm run lint`: **PASS**. `npm test`: **PASS**, 60 files and 342 tests. `npm run check:env`: **PASS**, 54 documented reads. `npm run check:migration-versions`: **PASS**, 44 unique migration versions. `git diff --check`: **PASS** (line-ending normalization warnings only).
- `npm run build`: sandbox run **FAIL** (`spawn EPERM` starting esbuild); elevated retry **PASS**, 1,615 modules, existing `App` chunk warning at 922.48 kB.
- `node --check scripts/test-research-holdout-concurrency.mjs`: **PASS**. `npm run test:research-holdout-concurrency`: **NOT-VERIFIED / BLOCKED**, exact failure `ECONNREFUSED 127.0.0.1:54322`. `npx --yes supabase start`: **BLOCKED**, `docker: command not found (podman also not found)`. The disposable local DB, Supabase CLI stack, and pgTAP tests were not run. No hosted database was contacted or modified.
- Database migration execution, PostgreSQL trigger behavior, RLS/grants, promotion RPC behavior, and concurrent insert result remain **NOT-VERIFIED**. The TypeScript unit suite is not evidence for these database properties.
- Scheduler topology remains **NOT-VERIFIED**. Repository docs prescribe one scheduler worker per project, but there is no deployment manifest or owner-confirmed topology. No distributed lease was added without evidence that multiple instances can schedule simultaneously.
- The code has unit coverage for missing current marks and invalid marks in mark-to-market, risk approval blocks when any open position lacks a current mark, and paper account reconciliation tests cover opens/closes. These tests passed as part of the 342-test suite; duplicate DB cycle/fill behavior and reconciliation against persisted ledger rows remain **NOT-VERIFIED** without PostgreSQL.
- Authenticated browser flows, actual provider instruments/candles/freshness, a stored-plan-to-fill lifecycle against a database, and provider-backed account marks remain **NOT-VERIFIED**. Keep autopilot disabled until migration/schema verification and the owner’s one-symbol paper validation pass.

Exact changed files in this follow-up:

`.env.example`; `backend/src/engines/research-engine.ts`; `backend/src/routes/learning-research.test.ts`; `backend/src/routes/learning-research.ts`; `backend/src/trader/research-run.ts`; `docs/DB_APPLY.md`; `docs/DB_MAP.md`; `docs/MIGRATIONS.md`; `docs/RESEARCH.md`; `docs/VERIFICATION.md`; `package-lock.json`; `package.json`; `scripts/verify-schema.sql`; `scripts/test-research-holdout-concurrency.mjs`; `src/lib/persistence/learning-research-persistence.ts`; `supabase/migrations/20261019000000_reject_overlapping_research_holdouts.sql`; `supabase/migrations/20261020000000_research_holdout_registration_window.sql`; `supabase/tests/research_governance.test.sql`; `supabase/tests/research_registration.test.sql`.
