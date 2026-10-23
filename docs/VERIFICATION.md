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
2. Open a configured USD crypto market and verify Admin availability shows its selected provider, source instrument, and `available`; if not, stop and record the per-timeframe provider result.
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

## Phase 1 implementation and verification — 2026-10-15

This section records the current workspace run. The older entries above are historical and may describe earlier code or a different test count.

### Repository checks

- `npm run check:env`: **PASS**, all 56 environment reads are documented.
- `npm run check:migration-versions`: **PASS**, 46 migration files with unique versions.
- `npm run check:secrets`: **PASS**, 411 cached/non-ignored files scanned; `.env.example` is the sole environment-file exception. The scan checks Supabase secret-key patterns, JWT-shaped values, Massive API key assignments, and committed `.env*` files. Local `.env` remains ignored and untracked.
- `npm run typecheck`: **PASS**.
- `npm run backend:typecheck`: **PASS**.
- `npm run lint`: **PASS**.
- `npm run test -- --maxWorkers=4`: **PASS**, 64 files / 407 tests. No todo or skipped tests remain in the prioritized engine, trader, paper service, autopilot, strategy, and indicator paths inspected for this run.
- `npm run build`: **PASS**, 1,615 modules; Vite reports the existing `App` chunk at 922.62 kB (warning only).
- `npm audit --audit-level=high`: **PASS**, zero vulnerabilities.
- `git diff --check`: **PASS**.
- `.github/workflows/ci.yml` now defines the requested main push/PR workflow, Node 20.19, npm CI, migration/env/secret checks, both typechecks, lint, tests, build, and a non-blocking npm audit artifact. This workflow has not yet run on GitHub. Branch protection is **NOT-VERIFIED / NOT-CONFIGURED** because no GitHub administrative connection was available.
- `supabase/.temp/` is ignored and its files are staged for removal from the index while retained locally. It had been tracked in prior commits, so this does not remove historical copies.

### Priority code and tests

- Added `backend/src/engines/paper-execution.test.ts` with assertions for rejection cases, all fill paths, fee/slippage math, reductions, and closed-trade ledger effects. The full suite above includes these tests.
- Hardened paper execution against invalid fee/slippage fractions and non-finite/negative cash.
- Autopilot entry planning filters configured symbols through the verified active Massive/USD registry. Open positions continue through the management path. Added regression coverage for excluding an unverified entry symbol.
- The targeted priority paths have no `it.todo`, `test.todo`, or skipped tests in this checkout. This does not assert that every test in the repository has exhaustive branch coverage.

### Live provider probe

The sanitized command `npm run probe:markets` queried configured autonomy symbols/timeframes using the existing provider service. Probe run: **2026-10-15 01:32 UTC** (timestamps and freshness below are those emitted by the probe; provider rate-limit headers were not available in the service result).

| Configured symbol | Timeframe | Result | Evidence |
| --- | --- | --- | --- |
| BTCUSD | 4h | UNVERIFIED | Empty candle series |
| BTCUSD | 1d | DATA RETURNED, STALE | Massive `X:BTCUSD`, USD; 5 candles, 5 closed; latest close `2026-10-11T00:00:00Z`; age about 264,745 seconds, over the configured freshness limit |
| BTCUSD | 1h | UNVERIFIED | Empty candle series |
| BTCUSD | 15m | RATE LIMITED | HTTP 429 |
| BTCUSD | 5m | RATE LIMITED | HTTP 429 |

No configured autonomy symbol used Twelve Data, so Twelve Data was **NOT PROBED**. There is no verified full timeframe set. BTCUSD is therefore not eligible for new planner entries; retain it quarantined until every required timeframe is returned fresh and the probe is repeated. These results do not establish provider uptime or a long-term rate-limit budget.

### Security incident requiring external remediation

A previously tracked `supabase/.temp` pooler URL contains remote database credentials in Git history. The credential itself is intentionally omitted from this document and console output. Removing the files from the current index and adding the ignore rule do not revoke the credential or erase old commits. **Rotate the affected database credential immediately**, then scrub the exposed history and coordinate the replacement with deployments. This workspace has no Supabase or GitHub administrative connection, so rotation, remote history rewrite, and branch-protection configuration are not completed here.

### Gate status

Phase 1 is **NOT GREEN**: local code checks pass, but provider coverage is not verified, branch protection is not configured, and historical credential remediation is outstanding. Phases 2–5 remain gated. No hosted database was contacted or modified by the local tests in this run.

## Follow-up remediation check — 2026-10-15 01:51 UTC

- Repeated configured Massive probe: results are still not eligible for planning. BTCUSD 4h and 1h returned empty series; 15m and 5m returned HTTP 429; 1d returned five closed candles, with the latest at `2026-10-11T00:00:00Z` and age about 265,899 seconds, still stale. Twelve Data remains unprobed because no configured autonomy symbol uses it.
- The secret scanner now checks for remote database URLs with embedded credentials and fails if `supabase/.temp` appears anywhere in reachable Git history. `npm run check:secrets`: **EXPECTED FAIL / REMEDIATION REQUIRED** because historical Supabase CLI state remains in this repository's reachable commits. No secret value is printed. CI checkout now fetches full history so the historical-path check is meaningful.
- Repository access to `origin` could not reach GitHub from this environment. Remote credential rotation, history rewrite/push, and branch-protection settings remain **NOT COMPLETED**. Do not treat removing the local cache or passing unit tests as remediation of the exposed credential.

### Corrected provider probe — 2026-10-15 01:54–01:56 UTC

The probe now spaces Massive requests according to the configured reserved request budget (30 seconds), rather than the one-second general probe interval. The earlier 429 results were caused by the probe cadence and are superseded. With compliant spacing, results were: BTCUSD 4h empty, 1d stale (same five candles ending `2026-10-11T00:00:00Z`), 1h empty, and HTTP 403 for both 15m and 5m. The returned error body was intentionally not logged, so the specific 403 cause is **NOT-VERIFIED**. No timeframe set is fully usable; keep entries blocked until the provider account/instrument coverage is resolved and a fresh probe passes.

The latest local test run after the remediation edits passed **64 files / 407 tests**; lint, `node --check scripts/check-secrets.mjs`, and `npm run check:env` also passed. The secret scan intentionally remains failing on the known historical `.temp` paths; current tracked/non-ignored files contain no detected remote credential URL.

## Local database proof attempt — 2026-10-15

`npm run test:research-holdout-concurrency` was attempted against its guarded local-only URL and failed with `ECONNREFUSED 127.0.0.1:54322`. Docker, Podman, and the Supabase CLI are unavailable in this workspace, so the local Supabase database cannot be started here. No hosted database was contacted. Migration/RLS execution, concurrent persisted writes, and restart recovery remain **NOT-VERIFIED**; do not infer them from the mocked TypeScript lifecycle tests.

## Route-level market data fail-closed follow-up — 2026-10-15

- The plan refresh route selects planner candidates only from selected, active USD crypto markets mapped to a supported provider (Massive or Twelve Data) whose availability status is `available`. It blocks registry entries still marked unverified before they can reach planning. Regression tests cover filtering unverified and unavailable symbols.
- Decision analysis now requires the market status to be `available`, rejects provider responses marked stale, and rejects a response when its newest confirmed closed candle exceeds the configured maximum age. Regression tests verify the unverified, stale-fallback, and old-candle rejection paths. The analysis service receives `dataState: ready` only after those checks pass.
- Focused decision and planner route suites: **PASS**, 12 tests. Full Vitest suite: **PASS**, 65 files / 418 tests. `npm run lint`, `npm run backend:typecheck`, `npm run check:env` (56 documented reads), `npm run check:migration-versions` (46 unique versions), `npm run build`, and `git diff --check`: **PASS**. Build warning remains for the existing 922.62 kB `App` chunk. The Vite/Vitest subprocesses required execution outside the workspace sandbox (`spawn EPERM` in sandbox).
- `npm run check:secrets`: **EXPECTED FAIL / REMEDIATION REQUIRED**; it detects historic `supabase/.temp` paths in reachable commits. No secret value is emitted. The working-tree scan did not report a current remote credential URL, but reachable history still needs remote remediation.
- No new real-provider probe or database integration was run in this follow-up. Prior corrected Massive probe evidence and the local PostgreSQL refusal above still apply. No hosted service was contacted.

Phase 1 remains **NOT GREEN**. CI workflow has not run on GitHub and branch protection is not configured; provider coverage, database runtime behavior, and remote credential/history remediation remain unresolved. Phases 2–5 remain gated.

## Autopilot candle-freshness follow-up — 2026-10-15

- The active paper-autopilot scheduler now checks every requested timeframe's latest closed candle against `MARKET_DATA_MAX_STALE_TTL_MULTIPLIER`, in addition to rejecting stale-cache responses. An absent closed candle or an over-age close is treated as a data failure, so the account entry path pauses and does not plan or replay entries from that series.
- Added helper coverage for recent, stale, and missing closed candles. Focused autopilot suite: **PASS**, 11 tests. Full suite: **PASS**, 65 files / 419 tests. `npm run backend:typecheck` and `npm run lint`: **PASS**.
- This remains code-level protection using mocked provider series. It does not verify configured provider coverage or persistence behavior; the corrected live probe and local database limitations above remain applicable. Phase 1 is **NOT GREEN**.

The freshness rule is now shared as `backend/src/trader/market-data-quality.ts` and also protects manual trader plan refresh and server-side decision analysis. Verification after that consolidation: focused suites **PASS**, 23 tests; full suite **PASS**, 65 files / 419 tests; backend typecheck and lint **PASS**. This does not change the external Phase 1 blockers.

The configured provider probe now requests 50 candles per configured symbol/timeframe, requires at least 50 fresh closed candles, and uses the same shared freshness rule as the entry paths. This checks enough history for the planner's 50-candle minimum. Prior live-probe rows above were collected with the former five-candle probe and therefore establish connectivity/freshness at that time only, not sufficient history depth; rerun the stricter probe when provider access is authorized. Added `npm run typecheck:scripts` and a CI step to keep the probe script typed. The script typecheck, frontend/backend typechecks, lint, and `git diff --check` pass locally; no provider request was made during this follow-up.

Repository hygiene recheck: no environment files other than `.env.example` are tracked, `supabase/.temp/` is ignored and untracked in the current checkout, and the current secret scan still fails specifically on historic `supabase/.temp` paths in reachable commits. No secret values were printed. Local cache cleanup does not remediate those commits.

Additional local gate recheck: `npm run check:env` **PASS** (56 variables), `npm run check:migration-versions` **PASS** (46 versions), production build **PASS** (1,615 modules, existing 922.62 kB `App` chunk warning), and `git diff --check` **PASS**. Vite required the already-used out-of-sandbox retry because esbuild cannot spawn inside the sandbox. No local PostgreSQL, Docker, Podman, or Supabase CLI executable was found, so database concurrency proof remains unavailable.

### Strict live provider probe — 2026-10-15 02:27–02:29 UTC

The updated `npm run probe:markets` requested 50 candles for each configured BTCUSD timeframe and used the shared trading freshness rule. It exited nonzero because every timeframe failed eligibility:

| Symbol | Provider | Timeframe | Result | Evidence |
| --- | --- | --- | --- | --- |
| BTCUSD | Massive | 4h | UNVERIFIED | Empty candle series; checked `02:27:24Z` |
| BTCUSD | Massive | 1d | UNVERIFIED | 50 closed candles, but stale; latest `2026-09-19T00:00:00Z`, age `2,168,877,024 ms`; checked `02:27:55Z` |
| BTCUSD | Massive | 1h | UNVERIFIED | Empty candle series; checked `02:28:27Z` |
| BTCUSD | Massive | 15m | UNVERIFIED | 3 closed candles (50 required), stale; latest `2026-10-14T00:30:00Z`, age `92,639,862 ms`; checked `02:28:58Z` |
| BTCUSD | Massive | 5m | UNVERIFIED | 10 closed candles (50 required), stale; latest `2026-10-14T00:45:00Z`, age `92,370,877 ms`; checked `02:29:29Z` |

No Twelve Data symbol is configured for autonomy. The probe observed no rate-limit response during this run. BTCUSD remains ineligible for planner entries; do not add it to a verified trading set until a repeat probe returns sufficient fresh closed history across all required timeframes.

The `MARKETS_VERIFIED_OVERRIDE` configuration bypass has been removed from the application, `.env.example`, and the ignored local `.env`; markets now start `unverified` and require the runtime provider probe to become `available`. The effective local config has `AUTONOMOUS_TRADING=false` and no retired verification override. This prevents a local configuration value from substituting for provider evidence. The Admin panel now explains that provider responsiveness alone is insufficient for planning and shows the basic probe's 1m candle count. Failed probes clear any prior candle count. The admin probe also spaces standard requests according to the Massive request window while retaining the priority reservation; with default 5 requests/minute and 2 reserved, its spacing is 20 seconds. A CI check scans 27 priority test files for todo, skipped, focused, and conditional tests. It passes on the current suite and rejected a temporary `it.skipIf` fixture as expected. Verification: market-availability suite **PASS**, 2 tests; full suite **PASS**, 65 files / 420 tests; frontend/backend/probe-script typechecks, lint, `npm run check:env` (**55** documented variables), migrations (**46 unique versions**), production build (**PASS**, 1,615 modules with the existing 922.93 kB `App` chunk warning), and `git diff --check` **PASS**. This does not change the unresolved historical secret, database-runtime, or GitHub branch-protection blockers.

The server no longer starts an unrequested market-universe probe on startup. Provider checks begin only through the authenticated Admin probe action, which now checks only symbols in `AUTONOMY_SYMBOLS`; all other registry symbols stay unverified. This avoids consuming the standard provider budget during startup and bounds the Admin probe to the configured paper-trading set. The basic Admin probe still checks only 1m provider responsiveness; the strict per-timeframe probe script is the evidence for planner history coverage. Backend typecheck, frontend typecheck, lint, environment check, priority test-stub check, and the full suite (**PASS**, 65 files / 420 tests) pass after this change.

## Current goal continuation — 2026-10-15

Expanded `backend/src/engines/paper-execution.test.ts` to cover infinite fee/slippage rejection, zero-cost entry fills, and reductions larger than the remaining quantity. The focused file passes 34 tests. Current full suite: **PASS**, 64 files / 412 tests; `npm run lint`: **PASS**. These remain unit-level proofs and do not establish persisted database lifecycle behavior.

The Phase 1 external blockers remain: reachable history still contains `supabase/.temp`, live Massive coverage remains incomplete (fresh spaced probe returned empty 4h/1h, stale 1d, and 403 for 15m/5m), no local PostgreSQL/Supabase runtime is available, and GitHub branch protection/workflow status are unverified. `AUTONOMOUS_TRADING=false` remains set locally.

### Strict Admin probe and blocker recheck — 2026-10-15

- The authenticated Admin probe now checks all unique configured planner, trigger, and management timeframes (currently 4h, 1d, 1h, 15m, 5m), requesting 50 candles per timeframe and spacing every request within the Massive standard-request budget. A market is `available` only if every timeframe has at least 50 fresh closed candles. Per-timeframe counts, timestamps, and generic failure reasons are returned to the UI; provider error bodies are not exposed. This closes the previous UI gap where a short 1m response could appear available despite unusable planner frames.
- The strict probe's known BTCUSD result still means it must remain unverified. This code change makes the authenticated Admin probe enforce and display that failure; it does not repair Massive's missing, stale, or forbidden data. No new live provider call was made during this change.
- Focused market availability tests pass (3 tests), including mixed-frame rejection. Frontend and backend typechecks and lint pass.
- `npm run check:secrets` still fails specifically because reachable Git history contains `supabase/.temp` paths. The directory remains ignored and untracked in the current index. Credential rotation and history rewriting require external Supabase/GitHub administration and have not been performed; local-only work cannot safely clear this finding.
- The local database runtime is still unavailable: `psql`, `postgres`, Docker, Podman, and Supabase CLI are not installed in this workspace, and the recorded guarded integration attempt refused `127.0.0.1:54322`. No hosted database was contacted. Runtime/concurrency proof remains outstanding.

### Strict configured-provider rerun — 2026-10-15 03:08–03:10 UTC

`npm run probe:markets` completed against the configured Massive endpoint and exited `1` because every configured BTCUSD timeframe failed the 50-fresh-closed-candle gate:

| Symbol | Provider | Timeframe | Result | Evidence |
| --- | --- | --- | --- | --- |
| BTCUSD | Massive | 4h | UNVERIFIED | Empty candle series; checked `03:08:15Z` |
| BTCUSD | Massive | 1d | UNVERIFIED | 50 closed candles, stale; latest `2026-09-19T00:00:00Z`, age `2,171,327,420 ms`; checked `03:08:46Z` |
| BTCUSD | Massive | 1h | UNVERIFIED | Empty candle series; checked `03:09:17Z` |
| BTCUSD | Massive | 15m | UNVERIFIED | 3 closed candles (50 required), stale; latest `2026-10-14T00:30:00Z`, age `95,089,377 ms`; checked `03:09:48Z` |
| BTCUSD | Massive | 5m | UNVERIFIED | 10 closed candles (50 required), stale; latest `2026-10-14T00:45:00Z`, age `94,820,257 ms`; checked `03:10:19Z` |

No HTTP 429 or 404 occurred during this probe. No Twelve Data autonomy symbol is configured, so it was not probed. Keep BTCUSD blocked for entries; this rerun confirms the provider/account coverage issue remains and does not supply an application-code workaround.

### Local PostgreSQL runtime recheck — 2026-10-15 03:11 UTC

The host does have PostgreSQL 18.6 running on `127.0.0.1:5432`; the `.env` `DATABASE_URL` points to a local database named `quantum`. A read-only transaction connected as the local `postgres` role and confirmed only the `public` schema; the Supabase `auth` and `storage` schemas and the project's expected research/paper tables are absent. Port `54322` remains closed and `LOCAL_SUPABASE_DB_URL` is unset. The guarded `test:research-holdout-concurrency` intentionally refuses port 5432 because it requires a disposable local Supabase instance on 54322. I did not bypass that guard, apply migrations, or mutate the `quantum` database. This establishes local PostgreSQL connectivity only; Supabase migrations, RLS, privileged RPCs, and concurrency behavior remain **NOT-VERIFIED**.

### Historical secret scan refinement — 2026-10-15

The secret check now inspects reachable historical `supabase/.temp` files for remote database URLs and reports findings without printing their contents. The check confirms that the historical `pooler-url` contains a remote PostgreSQL URL with non-placeholder user information; parsing found no password component in that URL. Treat its associated database access material as requiring rotation before any history rewrite, consistent with the existing remediation requirement. `npm run check:secrets` remains **FAIL** for both the historical CLI state and this remote URL. The present checkout still ignores `.env` and `supabase/.temp/`; neither path is tracked. No credentials were used, rotated, or emitted, and no history was rewritten.

The scheduler now has a slow-fetch regression test: while the first provider request is held open, candle-close timers fire and enqueue additional work; observed in-flight provider requests never exceed one. The focused test passes, and the full suite passes **66 files / 424 tests**. This verifies in-process queue serialization only; it does not establish cross-process or multi-host scheduler exclusion, and it does not test persisted ledger recovery.

A fresh read-only inspection of the configured loopback `DATABASE_URL` connected to PostgreSQL 18.6 (`quantum`) in a read-only transaction. The database still has no Supabase `auth` or `storage` schema and no `paper_accounts` or `research_experiments` table. The guarded Supabase concurrency test still cannot connect at `127.0.0.1:54322` (`ECONNREFUSED`). No migration or write was attempted. PostgreSQL connectivity is verified; project schema, Supabase RLS, and persisted concurrency remain **NOT-VERIFIED**.

### BTCUSD Twelve Data provider switch and strict verification — 2026-10-15 03:19–03:20 UTC

Massive remained unusable for configured BTCUSD, so the registry now maps only BTCUSD to Twelve Data (`BTC/USD`); other crypto mappings are unchanged. The app's Twelve Data adapter validated the provider instrument metadata, candle ordering, OHLC values, timestamp alignment, closed-candle count, and freshness on all five required frames. The official `npm run probe:markets` then exited successfully with 50+ fresh closed candles on every frame:

| Symbol | Provider | Timeframe | Result | Evidence |
| --- | --- | --- | --- | --- |
| BTCUSD | Twelve Data | 4h | AVAILABLE | 60 returned, 59 closed; latest `2026-10-14T20:00:00Z`; checked `03:19:38Z` |
| BTCUSD | Twelve Data | 1d | AVAILABLE | 60 returned, 59 closed; latest `2026-10-14T00:00:00Z`; checked `03:19:46Z` |
| BTCUSD | Twelve Data | 1h | AVAILABLE | 60 returned, 59 closed; latest `2026-10-15T02:00:00Z`; checked `03:19:54Z` |
| BTCUSD | Twelve Data | 15m | AVAILABLE | 60 returned, 59 closed; latest `2026-10-15T03:00:00Z`; checked `03:20:02Z` |
| BTCUSD | Twelve Data | 5m | AVAILABLE | 60 returned, 60 closed; latest `2026-10-15T03:15:00Z`; checked `03:20:10Z` |

The registry, strict probe, authenticated Admin availability service, planner selection, and autopilot eligibility now accept configured Massive or Twelve Data USD crypto only after the per-timeframe status is `available`. The Admin probe requests 60 candles to account for a forming bar and uses each provider's configured standard-request budget. It stores the selected provider and source instrument in status for inspection. `AUTONOMOUS_TRADING` remains false; this is provider coverage evidence, not evidence that a paper trade was entered or completed. A single successful probe does not prove sustained provider uptime or quota capacity.

Regression coverage includes Twelve Data BTCUSD mapping, strict multi-timeframe availability, verified planner/autopilot selection, and Coinbase's independent live-price mapping: focused suites **PASS**, 43 tests; full suite **PASS**, 65 files / 423 tests. Frontend/backend/probe-script typechecks, lint, environment and migration checks, priority-test-stub scan, and production build **PASS**. The existing `App` chunk warning remains (~937 kB). `git diff --check` passes with only Git's CRLF normalization notices.

### Strict provider freshness rerun — 2026-10-15 03:32–03:33 UTC

The configured strict probe was rerun from the current worktree. BTCUSD/Twelve Data returned 60 candles with at least 59 closed and fresh on each required frame: 4h latest close `2026-10-14T20:00:00Z` (checked `03:32:31Z`); 1d `2026-10-14T00:00:00Z` (`03:32:40Z`); 1h `2026-10-15T02:00:00Z` (`03:32:48Z`); 15m `2026-10-15T03:15:00Z` (`03:32:56Z`); 5m `2026-10-15T03:25:00Z` (`03:33:04Z`). The probe exited **0**. This is a second successful point-in-time probe; `AUTONOMOUS_TRADING=false` remains set, so it still does not prove order execution or sustained availability.

## Responsive UI sizing - 2026-10-16

- **Font audit:** baseline in this checkout had 34 CSS `font-size` rules at 8–11px and 94 `text-[8–11px]` utilities. Current source has 0 literal CSS sizes in that range and 0 such utilities; replaced rules/classes use 12px or larger tokens/utilities. The 11px `--fs-2xs` token remains available for secondary captions but is not currently used for visible text.
- **Sidebar:** collapse state, props, controls, icons, and collapsed CSS removed. Desktop sidebar stays expanded at 248px. Admin remains conditional on the role supplied by the authenticated profile; server checks remain authoritative.
- **Checks:** `npm run check:ui-layout`, `npm run typecheck`, `npm run lint`, `npm test` (67 files / 426 tests), and `npm run build` PASS. Build emits the existing large application chunk warning.
- **Browser screenshots / visual review:** NOT-VERIFIED. No viewport screenshots or authenticated page review were captured in this session. 390x844, 414x896, 768x1024, 1280x800, and 1440x900 overflow, clipped text, overlap, text scale, and touch targets remain unverified.
- **iPhone XR Safari:** NOT-VERIFIED. The implementation uses a five-item bottom tab bar and More sheet, but it has not been checked on real Safari. Owner checks: read text without zoom; reach the bottom bar with Safari controls visible; open More and verify Settings/Admin access; chart sizing and pinch/scroll; input focus zoom; Trader Desk usability; landscape rotation; sideways scrolling.

## Code review follow-up — 2026-10-16

- Replaced the remaining mobile slide-over drawer with the five-item tab bar and full-height More sheet; More contains every secondary route, Settings, admin-only Admin, and red Sign out. Added keyboard focus cycling and Escape close behavior.
- Dashboard chart height and terminal frame now derive from `100dvh` on small screens; safe-area viewport metadata and bottom padding keep content clear of the tab bar. Device and screenshot review remain NOT-VERIFIED.
- Replaced System Metrics' unwritten legacy-table dependency with the backend operational overview, and System Logs now reads admin audit events from the protected backend endpoint.
- `npm run typecheck`, `npm run lint`, `npm run check:ui-layout`, `npm test` (68 files / 428 tests), and `npm run build` PASS. The build still warns about the large App chunk.

## Configured provider probe — 2026-10-16 13:00 UTC

Ran `npm run probe:markets` using the configured local development provider setup. The script reported one configured autonomy symbol, BTCUSD, routed to Twelve Data (`BTC/USD`, USD). All required frames met the 50-closed-candle and freshness checks; no rate-limit response was observed.

| Symbol | Provider | Timeframe | Result | Closed candles | Latest closed candle | Checked |
| --- | --- | --- | --- | ---: | --- | --- |
| BTCUSD | Twelve Data | 4h | AVAILABLE | 59 / 50 | 2026-10-16 08:00 UTC | 13:00:17 UTC |
| BTCUSD | Twelve Data | 1d | AVAILABLE | 59 / 50 | 2026-10-15 00:00 UTC | 13:00:26 UTC |
| BTCUSD | Twelve Data | 1h | AVAILABLE | 60 / 50 | 2026-10-16 12:00 UTC | 13:00:34 UTC |
| BTCUSD | Twelve Data | 15m | AVAILABLE | 60 / 50 | 2026-10-16 12:45 UTC | 13:00:42 UTC |
| BTCUSD | Twelve Data | 5m | AVAILABLE | 60 / 50 | 2026-10-16 12:55 UTC | 13:00:50 UTC |

The probe exited 0. These results verify this configured symbol at one point in time; they do not establish sustained provider availability or authorize automatic paper entries. Massive was not the configured BTCUSD provider and was not probed in this run.

### Phase 1 gate status after this probe

- Local checks PASS: `check:env`, priority test-stub scan (28 test files scanned), migration version check (46 migrations), probe-script/frontend/backend typechecks, lint, UI layout check, full test suite (68 files / 428 tests), and production build.
- Repository hygiene FAIL: `check:secrets` reports historical `supabase/.temp` paths and remote database URL user-info in reachable history. The path is ignored and not tracked in the current checkout. Per the existing remediation audit, rotate the associated database access material before any history rewrite. No credential was displayed, rotated, or rewritten here.
- GitHub gate NOT-VERIFIED: `.github/workflows/ci.yml` is present, but this environment has no `gh` CLI or authenticated GitHub administration path; workflow status and required-check branch protection were not inspected or changed.
- **Phase 1 remains NOT GREEN. Phase 2 and later gated work has not started.**

## Chart trade overlays and drawing layers â€” 2026-10-16

- Added authenticated `GET /api/v1/trader/trades?symbol=...`, filtering paper positions, fills, plans and journal data through the authenticated account ID. Added an unauthenticated-request regression assertion.
- Chart history now refreshes independently every 30 seconds. Completed paper fills render entry/exit markers, exit reason, dashed connector and net PnL/R labels; open positions are sourced from the account positions and connect to the latest chart candle with floating PnL. Selecting or focusing a marker opens the existing `ExplainableTrade` component with stored execution details. New paper positions/trades record requested entry price, entry confidence and engine versions; old ledger records that predate these fields display “Not recorded.” Records outside the currently visible chart coordinates are counted in a status chip; their candles must be in the chart's loaded history before they can be plotted.
- Added independent Structure, Zones, Trade levels, Signals and Trades switches. Preferences use the user's RLS-protected `user_preferences.chart_layers` JSONB column; migration `20261016000001_chart_layer_preferences.sql` must be applied in the target database. Existing overlay line width is 2px; zone borders are 1.5px and visible labels are 14px.
- Regression coverage added for closed trade mapping and open position floating PnL. `npm run typecheck`, `npm run backend:typecheck`, `npm run check:migration-versions` (47 unique migrations), `npm run check:ui-layout`, and targeted ESLint **PASS**.
- Vitest and production build **NOT-VERIFIED in this execution environment**: Vite/esbuild config startup failed with OS `spawn EPERM`; the native config-loader workaround then failed resolving the extensionless Vite config import. No screenshots were captured, and desktop/browser/iPhone review remains **NOT-VERIFIED**. The local automated checks do not establish marker placement or touch usability on a rendered device.
- This begins the explicitly immediate chart work in Phase 7 (§7.4–7.5); it does not indicate Phase 2 ledger crash-safety or the other Phase 1 gate blockers are complete.

## Phase 1 gate recheck â€” 2026-10-16 13:30 UTC

- **PASS:** `check:env` (55 variables), priority test-stub check (28 files), migration-version check (47 unique migrations), frontend/backend/script typechecks, full lint, `check:ui-layout`, full Vitest suite (**69 files / 430 tests**), production build (**1,619 modules**; existing large `App` chunk warning), and the configured-market probe.
- **Provider evidence:** The probe enumerated BTCUSD via Twelve Data (`BTC/USD`). All required timeframes were available with at least 59 closed candles: 4h latest `2026-10-16T08:00:00Z`; 1d `2026-10-15T00:00:00Z`; 1h `2026-10-16T12:00:00Z`; 15m `2026-10-16T13:15:00Z`; 5m `2026-10-16T13:25:00Z`. Checks ran from 13:30:33Z through 13:31:05Z. No Massive symbol was included in this configured probe, so Massive end-to-end coverage remains **NOT-VERIFIED**.
- **PASS (working tree):** `git ls-files` found no `.env*` file except the permitted `.env.example`, and no current `supabase/.temp` entries. Both `.env` and `supabase/.temp/` are gitignored. The secret scanner emitted only findings and no matching values.
- **FAIL (reachable history):** `check:secrets` still finds historical `supabase/.temp` paths and a remote PostgreSQL URL with user information. The associated database access material must be rotated before history rewriting. Rotation and history rewrite were not performed; no credential was read from local `.env`, emitted, or changed.
- **NOT-VERIFIED (GitHub):** `gh` is unavailable and there is no confirmed GitHub connection to inspect workflow runs or set `main` branch protection. The GitHub connection must be authorized before that hosted rule can be changed.
- **Gate:** Phase 1 remains **NOT GREEN** until historical credential remediation and required GitHub branch protection are completed, and Massive coverage is recorded where Massive is configured. No work was done on gated Phases 2â€“5.

## Risk sizing and entry freshness follow-up — 2026-10-16

- `calculatePositionSize()` now uses the supplied fee and slippage rates for stop-risk and cash-affordability limits. Invalid, missing, non-finite, and out-of-safe-range prices fail closed. Regression tests cover custom cost rates, affordability, malformed OHLCV, and extreme numeric prices.
- Stored-plan execution now requires an explicit freshness approval. The scheduler supplies it from `entryCandleIsFresh()`; the pipeline supplies it only after its closed-candle age gate. Existing position management remains available while new entries are paused.
- Local checks: focused risk, service, scheduler, and pipeline tests **PASS** (4 files / 43 tests); full Vitest suite **PASS** (70 files / 439 tests); backend typecheck and lint **PASS**; `git diff --check` **PASS**.
- The local default for `AUTONOMOUS_TRADING` remains `false`. The scheduler still has process-local coordination only; no persistent worker lease or provider-to-database lifecycle integration was verified here. Keep autonomous entries disabled until those checks are proven in the target deployment.
- Decision/research behavior is still not one canonical screen-to-execution path: the browser Backtesting Center remains explicitly exploratory, while the backend research replay uses the paper planner and execution simulator. No profitable edge is established, and no changes here make ML, XAUUSD, or SilverUSD operational. Cross-instance lease, database/RLS, real-provider lifecycle, and out-of-sample edge verification remain **NOT-VERIFIED**.

## ML feature label quality follow-up — 2026-10-16

- ML feature computation is shared in `shared/ml-features.ts` between the Edge Function and Vitest tests. Flat-price RSI warmup now returns neutral 50, and forward labels are dropped when the close-to-close move is within `ML_LABEL_ATR_MULTIPLE × ATR` (default 0.1). The multiplier is validated and documented in `.env.example`.
- Focused feature tests **PASS** (1 file / 3 tests); `check:env` **PASS** (56 variables); backend typecheck **PASS**; `git diff --check` **PASS**.
- This corrects RSI and label noise only. It does not establish model profitability, add a momentum benchmark, persist model weights or train/test metrics, or prove edge-function deployment behavior. Those ML items remain **NOT-VERIFIED**.

## Paper entry ledger guard follow-up — 2026-10-16

- Before an eligible stored plan advances toward an entry, the backend now requires both local account accounting reconciliation and a successful service-role `verify_decision_ledger` RPC result. An RPC error, missing result, broken chain, or unreconciled account fails closed. Existing-position management remains a separate path.
- Focused paper lifecycle tests **PASS** (1 file / 15 tests); backend typecheck and targeted ESLint **PASS**.
- The RPC contract is mocked in unit tests. PostgreSQL execution, RLS/grants, concurrent mutation behavior, restart recovery, and a real provider-to-ledger lifecycle remain **NOT-VERIFIED**. This guard does not replace the missing persistent worker lease/fencing.

## ML benchmark follow-up — 2026-10-16

- Retraining now evaluates a one-candle momentum baseline against the same untouched chronological test rows as the logistic model. Training and test accuracy/F1/sample counts are separately reported; ties or lower test accuracy set `no-edge`. `/model/status`, `/retrain`, and prediction metadata expose the evaluation and edge status.
- Shared metric tests cover the same-window baseline, classification metrics, no-edge tie/loss handling, and invalid sets. Backend typecheck and targeted ESLint **PASS**; the Edge Function was not deployed or run against provider data.
- These are classification diagnostics, not profitability evidence. Model weights and evaluation metrics are still not durably stored as versioned artifacts; `/model/status` remains process-memory based. `expected_move_pct` remains heuristic, and ML predictive edge is **NOT-VERIFIED**.

## P1 ML artifact and strategy follow-up - 2026-10-16

- ML now uses a candle-time 70/15/15 split with forward-horizon purging. Neutral moves inside the configured ATR threshold are excluded from classifier labels, while all isolated validation forward returns remain aligned for expected-return calibration. Test metrics and a same-window one-candle momentum baseline determine the `no-edge` flag; the calibrated expected move is null when a probability bucket has too few validation samples.
- Added append-only `ml_model_artifacts` persistence with model weights, normalizers, train/test metrics, label and training parameters, provider/instrument/quote and dataset lineage, calibration buckets, and data range. Cold starts load and schema-check the latest compatible artifact. Predictions identify model version, calibration availability, and baseline comparison. `expected_move_pct` is nullable; consumers display unavailable rather than substituting a heuristic.
- Strategy-library detectors now receive and use validated parameter overrides for the seven live library entries; signals include strategy version and retain timeframe/market metadata constraints. This does not expand the independent autonomous Trader Desk planner or establish that these strategies have positive expectancy.
- Local source checks: frontend/backend TypeScript typechecks, targeted ESLint, migration-version check (48 unique versions), and Vite production build **PASS**; build emits the existing large `App` chunk warning. Full Vitest suite **PASS**, 73 files / 456 tests. `git -c core.whitespace=cr-at-eol diff --check` **PASS**; plain `git diff --check` reports CRLF in the historically CRLF-formatted backend repository file. The Edge Function has no local Deno executable, and its strict Deno typecheck was not run. PostgreSQL/pgTAP is **NOT-VERIFIED** (no local Supabase database); migration is not confirmed applied. No Edge Function deployment or real provider retrain was performed.
- This work does not prove predictive edge, fee-adjusted profitability, confidence intervals, or canonical equivalence between browser dashboard/backtest and the server paper-execution path. Research artifacts and approval gates exist in source/migrations, but their deployed RLS/RPC behavior is **NOT-VERIFIED**. Keep autonomous entries disabled until those deployment and lifecycle gates are verified.

## Phase 2-5 reliability work - 2026-10-16

- **Sizing and lifecycle regression:** the existing risk tests verify caller-provided fee/slippage assumptions affect both risk sizing and cash affordability. Added an interrupted-catch-up replay test: after a simulated worker termination, processing resumes strictly after its last committed candle checkpoint and matches uninterrupted event order. Focused risk, paper service, and autopilot suites **PASS**, 3 files / 46 tests; full suite **PASS**, 73 files / 456 tests; frontend/backend typechecks, full lint, and production build **PASS** (existing large App chunk warning).
- **Atomic recovery contract:** expanded `supabase/tests/ledger_health.test.sql` with an injected account-row update failure after ledger append. It asserts transaction rollback leaves the account version and ledger untouched, then a retry commits the checkpoint and event exactly once and the ledger verifies. pgTAP was **NOT-RUN** because this workspace has no Supabase CLI, Docker/Podman, or local Supabase database. This remains a test contract, not database proof.
- **Migration checks:** migration version scan **PASS**, 48 unique migration files. No migration was applied. Fresh install/upgrade, deployed RLS ownership, service-role RPC authorization, concurrency, and effective grants remain **NOT-VERIFIED**.
- **Secret handling:** strengthened `scripts/check-secrets.mjs` to scan changes in all reachable Git history for Supabase secret keys, JWT-shaped tokens, Massive key assignments, remote credential URLs, and committed environment files without printing matched contents. The scanner **FAILS** on existing reachable history: Supabase CLI state, a credential-bearing remote DB URL, Supabase secret-key-shaped material, and Massive key-assignment-shaped material. No secret was opened or printed. Rotate affected credentials in their provider/control panels before any shared-history rewrite; history cleanup is **NOT-DONE**.
- **Cycle and operations gates:** a provider-data-to-confirmed-entry-to-managed-exit-to-journal-and-reconciled-balance cycle with restart against a disposable Supabase database is **NOT-VERIFIED**. Provider data may not be converted into a confirmed fill without the database RPC path. There is still no durable multi-instance scheduler lease; retain the single-worker deployment rule and keep `AUTONOMOUS_TRADING=false` until a real paper-only cycle and recovery pass.
- **Phases 3-5:** the browser Backtesting Center remains a separately calculated exploratory view; it is explicitly labeled as excluding realistic costs and benchmarks. Backend research replay has cost inputs, immutable experiment lineage, holdout collection and promotion gates, but no controlled forward experiment or profitable net result was produced in this run. Deployment alerts, backup restoration, hosted migration/RLS checks, and runbook recovery drills remain **NOT-VERIFIED**.

## Canonical Backtesting Center follow-up - 2026-10-16

- Replaced the browser-side `runBacktest`/strategy-detector result path with the authenticated research experiment workflow. The page registers a named hypothesis and fixed future holdout, then calls the server's canonical trend-pullback planner/replay endpoint. It displays collection progress and only renders persisted metrics after server gates allow a run.
- The UI explicitly reports that it uses 15m trigger candles, server-fetched higher-timeframe context, and fixed 0.10% fee / 0.05% slippage assumptions. It does not present loaded chart candles as the experiment dataset. This is a single canonical research path for the Backtesting Center; dashboard/browser signal presentation and live decision-context enrichment are not unified by this change.
- Focused UI render test **PASS** (1 test); frontend and backend TypeScript checks **PASS**; ESLint **PASS**. A live authenticated forward experiment was not started: provider entitlement, active database migration/RLS/RPC behavior, and the required 90-day/100-trade collection remain **NOT-VERIFIED**. No profitability or strategy edge is claimed.
- Each experiment's collection is currently advanced by a user invoking the run/check action; there is no background collection worker. Keep the experiment page available and recheck often enough to satisfy the backend provider lookback and continuity limits documented in `RESEARCH.md`.

## Fenced paper-autopilot worker lease - 2026-10-16

- Added a database lease per enabled paper-autopilot account with expiring ownership, heartbeat renewal, monotonic fencing tokens, and compare-and-set release. Autopilot account mutations now pass the fence to `record_paper_account_update`; the RPC locks and validates the current lease in the same transaction before writing ledger/account state, rejecting stale or expired workers. Account reads no longer create rows, so initial state creation occurs only inside the first fenced mutation.
- Added a pgTAP contract for competing claims, renewals, expiry/reclaim with incremented fencing token, stale-write rejection, current-owner write acceptance, and service-role-only grants. Added client tests for the scheduler lease RPC wrapper.
- Lease-client and account-service/autopilot focused tests **PASS** (3 files / 30 tests); backend typecheck and full ESLint **PASS**. Full suite/build rerun is pending after this change. The SQL/pgTAP contract was **NOT-RUN** because no local Supabase/PostgreSQL runtime is available. The migration is not applied to a target database; do not run multiple scheduler workers until it is applied and the database concurrency test passes. Durable deployment recovery and a provider-to-entry-to-exit paper cycle remain **NOT-VERIFIED**.

## Fresh checkout verification - 2026-10-19

- Verified checkout is based on `077859c` (`feat: enhance mobile navigation and styling`); these results include the uncommitted changes in this workspace, not a clean build of the commit alone.
- After adding the missing Vitest imports to `shared/cors.test.ts`, `npm test` **PASS** (78 test files / 469 tests). The first run had 466 passing tests but the CORS test file failed to load because its Vitest globals were not imported; the rerun passed.
- `npm run typecheck`, `npm run backend:typecheck`, `npm run lint`, `npm run build`, `npm run check:migration-versions`, and `git diff --check` **PASS**. The migration check found 49 unique versions. Build reports the existing large `App` chunk warning.
- The new multi-timeframe tests cover populated, empty, and failed requests per timeframe; all 4 pass. The four analysis panels are explicitly separate from the ten-value `TIMEFRAMES` selector contract. The selector is in `Dashboard.tsx`; `PriceChart.tsx` renders the supplied candles. Massive has direct mappings for all ten values; Twelve Data provides the other nine directly, and the unsupported 3-minute interval is aggregated from consecutive 1-minute candles.
- **NOT-VERIFIED:** no Supabase CLI, Docker, or Deno runtime is available in this workspace. No migration was applied and no hosted Edge Function was invoked. The initial test-only verification did not contact the database; later read-only hosted health checks are recorded below. Migration application, Edge Function configuration, persistent model save/load across restart, deployed auth/CORS behavior, and deployed prediction responses remain unverified. The pgTAP artifact/lease tests and competing-worker, expiry, stale-fence, restart, and atomic-write checks were not run against a disposable database. Do not treat local passing tests as deployment/database evidence; keep autonomous entries disabled until those gates pass.
- **Live configured-market provider probe - 2026-10-19 01:12-01:13 UTC:** `npm run probe:markets` **PASS** for the configured autonomy symbol `BTCUSD` through Twelve Data (`BTC/USD`). The five required timeframes (`4h`, `1d`, `1h`, `15m`, `5m`) each returned 60 candles / 59 closed candles, passed the 50-closed-candle minimum, and were reported fresh (`stale: false`). This proves provider availability at the probe time; it does not write the separate backend process's in-memory `getMarketAvailability()` state. The running backend's authenticated availability read returned 401 without a user session, so the Admin UI status was not refreshed from this CLI run. To populate that process's status, sign in as an admin and use Admin → Market Availability → Probe markets; repeat after a backend restart because availability state is in memory.
- **All chart timeframes - 2026-10-19 01:24-01:30 UTC:** Twelve Data returned fresh series for `BTCUSD` on 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w, and 1M. Its `3min` request returned HTTP 400; changed the backend to aggregate 3m bars from consecutive 1m candles, with unit coverage for missing source bars. A post-change live request returned 59 fresh closed 3m candles. A repeated sweep later hit Twelve Data HTTP 429 on 1d, 1w, and 1M after earlier successful requests for those same intervals; those three were not reverified in that second sweep. Provider confirmation does not refresh Admin in-memory market availability; use the authenticated Admin probe to update its status.
- **Account reconciliation:** the connected database's health RPC checked three empty accounts, each with no open positions or trades. Their implied starting balance is $100,000, while `.env` had `TRADER_STARTING_EQUITY=100`. After authorization, the local configuration was aligned to $100,000; a fresh process called the hosted health RPC and received `verified`, 3 checked / 0 broken. No account rows were changed. The running backend must restart to load the updated configuration.
- **Hosted schema diagnosis:** `verify_paper_schema` reported only `table:research_collection_state` missing. The existing 20261021 migration cannot be replayed as-is because `research_collection_candles` already exists. Added a forward-only 20261025 repair migration for the missing state table. It was **NOT-APPLIED**: `DATABASE_URL` targets localhost:5432, and no hosted DB URL, Supabase CLI access token, or CLI login is configured.
- **Post-fix checks:** full `npm test` **PASS** (78 files / 471 tests); backend typecheck, ESLint, and migration-version check **PASS** (50 unique versions). `npm run probe:markets` / follow-up live calls confirmed fresh BTCUSD series for all ten selector values after adding Twelve Data 3m aggregation, though a quota-limited second sweep returned 429 for 1d/1w/1M after earlier successful requests. No hosted migration or running-backend restart was performed.
