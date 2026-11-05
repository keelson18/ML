# Quantum Intelligence: Audit and Fix Prompt

## 1. Overview

This document records a read-only audit of the non-docs source of the Quantum Intelligence repository, with prioritized fixes. No application code was changed in producing it.

**Scope and limits**

- Git history was not available: the project folder is not a git repository, so there is no commit history to compare. Changes are tracked only by reading current files.
- Coverage was partial. Three read-only investigations covered candle timing and decisions, provider and synthetic-data coupling, and UI. Several files were listed as not read (see section 4). Findings marked "unverified" must be confirmed before work starts on them.
- Database work from earlier in this session (security advisor repairs, admin review policies, market coverage tiers, AI learning journal) was applied to the live database. Repo copies under `supabase/migrations/` have not been confirmed to match the applied SQL.

## 2. Tech Stack

- Frontend: React 18, Vite 7, Tailwind CSS, lightweight-charts
- Backend: Fastify 5 (Node), Vitest for tests
- Data and auth: Supabase (Postgres with row level security, auth, Edge Functions), pgTAP for database tests
- Market data: Twelve Data and Massive (REST), Coinbase (live stream), with a server-side paper trading engine

## 3. Audit Summary

| Severity | Count | Theme |
|---|---|---|
| Critical | 0 | No confirmed critical defects in the read paths |
| High | 5 | Forming candle could reach analysis (unverified); overlay plumbing missing; stale price shown as live; hardcoded system status; client-only admin enforcement not verified server-side |
| Medium | 9 | Open 3m bucket emitted as closed; stale-candle checks rely on callers; browser clock used for closure; admin MFA can be skipped by config; fabricated or mislabeled metrics; settings defaults saved after load failure; tap targets below 44px; unhandled promise; client-side paper service |
| Low | 10+ | Provider-name branching; cache overwrite race; text below 12px; duplicated selectors and navigation; hardcoded colors; minor accessibility gaps |

Positive controls confirmed: the server paper executor requires a boundary-verified closed candle (`backend/src/services/paperTradingService.ts:126-127`); the scheduler pauses on stale data (`backend/src/autonomy/scheduler.ts:86-91`); the market data service never generates candles, and returns stale cached data or an error on provider failure (`backend/src/services/marketDataService.ts:219-231`). No mock, simulated, or fallback candle generator was found in production paths.

## 4. Issues

### Issue 1 (High, unverified): Forming candle may feed analysis

- **Where:** `src/lib/providers/stream-client.ts:127-143` dispatches forming candles to every listener on a matching timeframe, with zero volume. `src/lib/strategies.ts:7-19` takes the last array element as the entry price with no closed-candle check. `src/lib/chart-data.ts:16-22` does not drop the forming bar.
- **Problem:** If any analysis or signal listener subscribes to the stream, a decision can be made on an unfinished candle.
- **Fix:** Confirm which listeners feed decisions. Route forming candles only to chart rendering, and filter to closed candles before any strategy or risk calculation.
- **Acceptance:** A unit test shows a forming candle never changes a decision output.

### Issue 2 (High): Price chart is missing overlay plumbing

- **Where:** `src/components/PriceChart.tsx:14-17` accepts only `candles` and `theme`. Nothing in `src` references `addLineSeries`, `setMarkers`, or `syncOverlays`.
- **Problem:** The specification requires overlays (line series, markers, and price lines). They are not implemented.
- **Fix:** Add optional overlay props and the line and marker series, keeping the existing candlestick series. Keep the existing `check:ui-layout` and `PriceChart.test.tsx` passing.
- **Acceptance:** Tests cover overlay rendering with and without overlays.

### Issue 3 (High): Stale price shown as live

- **Where:** `src/components/Dashboard.tsx:152` sets the live price from the in-memory cache before the fetch completes. The header price at `Dashboard.tsx:334` shows no stale state; the stale banner at `Dashboard.tsx:390-395` is the only signal.
- **Fix:** Show a stale or "updating" indicator next to the header price whenever the value comes from cache or the response is marked stale.

### Issue 4 (High): Hardcoded system status

- **Where:** `src/components/Sidebar.tsx:59` renders "SYSTEM NOMINAL" as static text. `Sidebar.tsx:61` shows a static "v2.0".
- **Problem:** The label claims health that nothing checks.
- **Fix:** Drive the indicator from a real health check, or remove the claim.

### Issue 5 (High, unverified): Admin access is enforced only in the UI

- **Where:** `src/components/Dashboard.tsx:96, 108, 278, 302` and `MobileNavigation.tsx` hide admin tabs. The server's admin endpoints (e.g. `/api/v1/admin/ai/overview`) were not checked here.
- **Fix:** Confirm each admin endpoint and admin SECURITY DEFINER function rejects non-admin and non-MFA callers server-side. Note that the database functions check `auth.uid()` and `is_current_user_admin()` internally, per earlier work.

### Issue 6 (Medium): Partial open 3-minute candle emitted as closed

- **Where:** `backend/src/services/marketDataService.ts:412-413`: `if (count === 3 || intervalIsOpen) aggregated.push(current);`
- **Problem:** The still-forming 3m bar, which may have only one or two minutes of data, is returned as a normal closed candle.
- **Fix:** Exclude the open bucket from closed-series results, or flag it as forming as the live aggregator does.

### Issue 7 (Medium): Closure checks use the browser clock

- **Where:** `src/lib/candle-clock.ts:8, 55` default to `Date.now()`. `src/lib/providers/stream-client.ts:138` uses `Date.now() / 1000`.
- **Fix:** Pass server time into any decision-relevant closure check, or use server-provided timestamps.

### Issue 8 (Medium, unverified): Trigger-candle staleness depends on callers

- **Where:** `backend/src/services/paperTradingService.ts:26-34` checks staleness for 1m mark prices, not the trigger candle. The `entriesAllowed` gate at `:174` is supplied by the caller, and `backend/src/autonomy/pipeline.ts` (where it is set) was not read.
- **Fix:** Check the trigger candle's age inside the executor, and confirm how `entriesAllowed` is computed.

### Issue 9 (Medium): Older candle can re-advance plans

- **Where:** `backend/src/services/paperTradingService.ts:159-162` checks equality against the last processed candle only. An older candle arriving after a newer one passes the check.
- **Fix:** Reject candles whose time is less than or equal to the stored checkpoint.

### Issue 10 (Medium): Browser-side paper order path

- **Where:** `src/lib/application/paper-trading-service.ts:26-34` simulates an order and persists it with `persistPaperOrder`. It is exported through `src/lib/application/index.ts:2` and only used by its test.
- **Problem:** Unused today, but it would bypass the server's closed-candle and staleness checks if wired in.
- **Fix:** Remove it, or route all order persistence through the backend.

### Issue 11 (Medium): Fabricated or mislabeled metrics

- **Where:** `src/components/pages/AIAnalysis.tsx:39` shows ML probability as "AI Confidence Gauge" without a calibration caveat. `AIAnalysis.tsx:65` labels `recommendation.score` as "Trend Strength". `AIAnalysis.tsx:110` shows "Trending" or "Ranging" from a fixed threshold. `src/components/AutonomousCommandCenter.tsx:63` says "WATCHLIST / 4H BIAS" regardless of the selected timeframe. `AutonomousCommandCenter.tsx:69` shows "Data: Validated" for any series of 60 or more candles.
- **Fix:** Relabel with what is computed, add the calibration caveat, and derive "Validated" from real checks.

### Issue 12 (Medium): Markets quotes

- **Where:** `src/components/pages/MarketsPage.tsx:61` shows "0.00%" when there is no prior bar. `MarketsPage.tsx:59` uses the last daily bar without a closed-candle filter, unlike `PortfolioPage.tsx:50`. There is no staleness check.
- **Fix:** Show "n/a" when there is no prior bar, filter to closed bars, and add the stale indicator.

### Issue 13 (Medium): Admin MFA can be skipped by configuration

- **Where:** `src/components/AdminRoute.tsx`: administrator routes must require verified AAL2.
- **Fix:** Make the server enforce MFA for admin functions and treat the client flag as display-only, or make MFA the default.

### Issue 14 (Medium): Static fallback coverage table

- **Where:** `src/components/AdminPanel.tsx:151` falls back to `getMarketCoverageTable()` when the server returns no rows, and `:162` presents it as registry coverage.
- **Fix:** Show an explicit empty or error state instead of static data.

### Issue 15 (Medium): Settings defaults saved after load failure

- **Where:** `src/components/pages/SettingsPage.tsx:19` keeps `DEFAULT_NOTIFICATIONS` (`marketAlerts: true`) in the toggles at `:191-194` after the load error at `:48`.
- **Fix:** Disable saving when preferences fail to load, and show a retry.

### Issue 16 (Medium): Unhandled promise rejection

- **Where:** `src/components/MultiTimeframeTerminal.tsx:21-23` has `.then` and `.finally` but no `.catch`.
- **Fix:** Add a `.catch` that sets an error state.

### Issue 17 (Medium): Tap targets below 44px on mobile

- **Where:** `src/index.css:353-357` (theme, notification, account buttons at 40px); `index.css:683-684` (landing theme toggle 34px wide, CTA 38px) at 390px and below; `index.css:631` (account menu items at 42px).
- **Fix:** Raise these to 44px minimum.

### Issue 18 (Medium): Local-only password lockout

- **Where:** `src/components/pages/SettingsPage.tsx:29-35, 109-111` enforce the 5-attempt lock with localStorage only.
- **Fix:** Rely on Supabase's server-side limits, and show the lock as informational only.

### Issue 19 (Medium): Client-side loss-limit division

- **Where:** `src/components/pages/TraderDesk.tsx:107-108` divides by `dailyLossLimitPct`. A value of 0 produces Infinity, clamped to 100%.
- **Fix:** Show "no limit set" when the value is 0.

### Issue 20 (Low): Provider-name branching in business logic

- **Where:** `backend/src/services/marketAvailability.ts:37, 39, 57-62, 88-89`; `src/lib/market-coverage.ts:36-37, 47`.
- **Fix:** Move provider rules into the provider registry so adding a provider does not require editing these branches.

### Issue 21 (Low): Cache overwrite race

- **Where:** `backend/src/services/marketDataService.ts:320-321` writes the cache unconditionally.
- **Fix:** Compare `fetchedAt` or the latest candle time before writing.

### Issue 22 (Low): Equity curve drawn as candles

- **Where:** `src/components/pages/ExploratoryBacktesting.tsx:67-80` builds fake OHLC bars with zero volume from equity, and `:70` can produce duplicate timestamps that the chart rejects.
- **Fix:** Use a line series for equity, or remove this file (see Issue 23).

### Issue 23 (High): Orphaned page component

- **Where:** `src/components/pages/ExploratoryBacktesting.tsx` is not imported anywhere. `Dashboard.tsx:297` renders `BacktestingCenter` for the backtesting route.
- **Fix:** Confirm `BacktestingCenter` is the live page. Then delete the orphan, or route it with tests and an impact note.

### Issue 24 (Low): Text below 12px

- **Where:** `src/index.css:572, 631, 613, 625, 531, 573` (11px); `AutonomousCommandCenter.tsx:111-118` and `AILearning.tsx:211, 275, 281` use `text-[11px]`.
- **Fix:** Use a 12px minimum.

### Issue 25 (Low): Hardcoded colors

- **Where:** `src/components/PriceChart.tsx:50-68` hardcodes chart colors that duplicate theme tokens; `src/index.css:210, 527, 552` use literal colors.
- **Fix:** Read colors from the theme tokens.

### Issue 26 (Low): Duplicated controls and navigation

- **Where:** market and timeframe selectors are repeated at `Dashboard.tsx:308-311, 347-387, 417-435, 447-465`; sign-out appears in `Sidebar.tsx:60`, `Dashboard.tsx:442`, `MobileNavigation.tsx:71`; CMS appears at `Dashboard.tsx:285` and `AdminPanel.tsx:95`.
- **Fix:** Extract shared selector and sign-out components.

### Issue 27 (Low): Labels and accessibility

- **Where:** "Chart" vs "Dashboard" (`MobileNavigation.tsx:6`, `Sidebar.tsx`); `LandingPage.tsx:20-21` links to `#principles`, which points to the footer; `AILearning.tsx:141-143` tabs lack arrow-key navigation; `AIAnalysis.tsx:24` has no `h1`; `PageFrame` is used only in `TraderDesk.tsx:111`; `TraderDesk.tsx:110` double-pads.
- **Fix:** Align labels, fix the anchor, add keyboard tab support, and use one page heading pattern.

### Issue 28 (Low): Test-only Supabase environment

- **Status:** Resolved earlier in this session (`vite.config.ts` test environment fallbacks).

## 5. Fix Order

1. Issues 23, 10: remove or wire the orphan and browser paper path (small, reduces risk).
2. Issue 1: confirm forming-candle consumers, then filter to closed candles (highest decision risk; verify first).
3. Issues 6, 8, 9, 7: candle closure and staleness on the server, with tests.
4. Issues 5, 13: confirm and enforce admin and MFA server-side.
5. Issues 3, 4, 11, 12, 14, 15, 16, 19: truthful state, labels, and error handling in the UI.
6. Issue 2: overlay plumbing in the price chart.
7. Issues 17, 18, 24, 25, 26, 27, 20, 21: tap targets, text sizes, colors, duplication, and internal cleanups.

## 6. Testing Checklist

- [ ] `npm run build` passes
- [ ] `npx vitest run` passes (last run: 82 files, 504 tests)
- [ ] `check:env`, `check:ui-layout`, `check:priority-test-stubs`, `check:migration-versions` pass
- [ ] `check:secrets` is reviewed: it depends on git, which is unavailable in this folder
- [ ] pgTAP suites run with `supabase test db` (not yet run in this session)
- [ ] Security advisor reviewed: remaining warnings are intentional admin SECURITY DEFINER functions, plus leaked-password protection, which must be enabled in the Supabase dashboard
- [ ] Each new migration in `supabase/migrations/` matches the SQL applied to the live database
- [ ] Forming candle test: a forming candle never changes a decision
- [ ] Closure test: the server rejects open candles and stale trigger candles
- [ ] Viewport smoke test at 375x667, 393x851, 414x896, 768x1024, and 1440px wide
- [ ] Admin gating test: non-admin and non-MFA users are blocked at the server
