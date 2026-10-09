# Verification record

This file reports evidence observed in the repository and this workspace session. A passing unit test does not prove a deployed Supabase migration, provider key, live market feed, or production configuration. `NOT-VERIFIED` means the required environment or manual check was unavailable; it is not a pass.

## Phases 0–11 evidence

| Requirement | Status | Evidence / check |
| --- | --- | --- |
| Market-data cache refetches after TTL | PASS | `backend/src/services/marketDataService.test.ts` — `refetches after the timeframe TTL expires`; mocked provider fetch was called twice after the 1h TTL. |
| Stale fallback has a bounded age | PASS | Same test file — `serves an expired result as stale only while within the configured age bound` and `throws when provider failure occurs after the stale age bound`. |
| Stale market data cannot open entries | PASS | `backend/src/services/paperTradingService.test.ts` — `rejects new positions when market data is stale`; planner/scheduler entry paths also test stale flags in `backend/src/autonomy/pipeline.ts` and `backend/src/routes/trader.ts`. |
| Helmet and rate limiting are registered once; health and 429 behavior | PASS | `backend/src/server.ts` registers each plugin once. `backend/src/server.test.ts` — `builds and serves health with standard security headers` (200), `rate limits authenticated market requests using configured quota` (429). Route-level 429 behavior is also covered in `backend/src/routes/market.test.ts`. |
| No production Binance provider calls or USDT market decisions | FAIL | No Binance implementation/provider call was found in current source, but `src/lib/markets.ts` still has a production legacy `USDT → USD` alias map. `src/lib/market-hardcode-guard.test.ts` passes, but explicitly excludes `markets.ts`; that test alone does not prove the requested no-USDT claim. |
| Market availability is shown per symbol; unavailable symbols are hidden/rejected | PASS (implementation only) | `src/lib/markets.ts` filters `unavailable` symbols from selectors; `backend/src/trader/paperTradingService.ts` rejects unverified/unavailable markets. `AdminPanel` shows `available` / `unavailable` / `unverified`. |
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
7. Open Journal & daily review; inspect one closed-trade row and verify R, MAE, MFE, engine and dataset version fields (MAE/MFE currently fail the evidence check above).
8. Open Admin → Event Risk; create a short test blackout, confirm audit history, observe the active countdown/entry block, then cancel it.
9. Sign out and verify the authentication screen returns.

## Phase E and CI

- `npm run check:env` passes in this workspace: all 35 detected environment variable reads are listed and commented in `.env.example`.
- CI workflow is present at `.github/workflows/ci.yml` and declares install, environment check, typechecks, lint, tests, build, and a non-blocking production dependency audit artifact. GitHub Actions has not run for this worktree (NOT-VERIFIED green CI).
- Final local verification: `npm test` passed 149 tests in 30 files; frontend and backend typechecks passed; `npm run check:env` passed; lint exited successfully with three existing Fast Refresh warnings; production build passed with a chunk-size warning.
- `npm audit --omit=dev --json` reported 0 info/low/moderate/high/critical vulnerabilities across 88 production dependencies. CI uploads the machine-readable report without failing the job for advisory findings.
- `package.json` has no `api:dev` script and the current server is Fastify (`backend/src/server.ts`). Duplicate decision routes, parallel API clients, and legacy Supabase tables remain; cleanup is not complete. No migration was removed.
