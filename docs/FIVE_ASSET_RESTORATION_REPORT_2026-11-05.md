# Five-Asset-Class Restoration — Audit and Implementation Report

**Date:** 2026-11-05
**Baseline commit:** `f5d19cc54f5b4cbbbc1d449c4efbcb7653f37f78` (`Refactor market constants and authentication logic`) plus the uncommitted working-tree changes listed below.
**Scope:** Crypto, Commodities, Forex, Indices, Stocks — paper/simulation only.

Every statement below marked **VERIFIED** was reproduced locally with `vitest`, `tsc`, `eslint`, or `vite build`. Nothing in this report claims a live provider probe, hosted-database check, or browser/UI runtime check; those remain **NOT-VERIFIED**.

---

## 1. Repository audit

### 1.1 Execution path traced

`src/lib/markets.ts` (registry) → `src/lib/marketCapabilities.ts` (capability resolution, new) → `backend/src/domain/LiveSymbolMap.ts` and `backend/src/services/marketDataService.ts` (provider resolution + adapters + validation) → `backend/src/services/marketAvailability.ts` (diagnostics) → `backend/src/routes/market.ts` (canonical candles) → `backend/src/routes/decisions.ts` → `backend/src/engines/*` → `backend/src/trader/planner.ts` → `backend/src/trader/risk.ts` → `backend/src/services/paperTradingService.ts` → ledger/research/journal.

### 1.2 Module classification

| Module | Classification | Evidence / note |
| --- | --- | --- |
| `src/lib/markets.ts` | CONNECTED_BUT_MALFUNCTIONING → **FIXED** | `getTrackedMarkets()` was crypto/commodity only; registry advertised `provider: 'oanda'` with no adapter. |
| `src/lib/marketCapabilities.ts` | **MISSING_IMPLEMENTATION → IMPLEMENTED_AND_WORKING** | New single authority for provider support, settlement, precision, sessions, side eligibility. |
| `backend/src/domain/LiveSymbolMap.ts` | CONNECTED_BUT_MALFUNCTIONING → **FIXED** | Mapped stocks into the Twelve Data index although the registry assigns them to Massive. |
| `backend/src/services/marketDataService.ts` | IMPLEMENTED_AND_WORKING | Fail-closed adapters, provenance, OHLCV/timestamp validation. Three duplicated mapping rules replaced by the shared resolver. |
| `backend/src/services/marketAvailability.ts` | PARTIALLY_IMPLEMENTED → **FIXED** | Probe list was restricted to crypto/commodity. |
| `src/lib/providers/*` (`client`, `index`, `stream-client`) | IMPLEMENTED_AND_WORKING | Frontend data access goes through the authenticated backend; no browser-side provider credentials. |
| `backend/src/routes/market.ts` | IMPLEMENTED_AND_WORKING | Repository-backed access, provider errors mapped honestly, no synthetic candles. |
| `backend/src/routes/decisions.ts` | CONNECTED_BUT_MALFUNCTIONING → **FIXED** | Rejected forex/index/stock before any analysis. |
| `backend/src/autonomy/paper-autopilot.ts` | CONNECTED_BUT_MALFUNCTIONING → **FIXED** | `isAutopilotSymbol()` required crypto + USD. |
| `backend/src/routes/trader.ts` | CONNECTED_BUT_MALFUNCTIONING → **FIXED** | `selectVerifiedPlannerMarkets()` required crypto + `priceCurrency === 'USD'`. |
| `backend/src/trader/planner.ts` | CONNECTED_BUT_MALFUNCTIONING → **FIXED** | Hardcoded `symbol.endsWith('USD')`; no session gate. |
| `backend/src/services/paperTradingService.ts` | CONNECTED_BUT_MALFUNCTIONING → **FIXED** | Hardcoded `priceCurrency !== 'USD'`; no session gate for exchange-traded instruments. |
| `backend/src/routes/learning-research.ts` | PARTIALLY_IMPLEMENTED → **FIXED** | USD-only + literal crypto gate for forward collection replaced by explicit capabilities. |
| `backend/src/trader/risk.ts` | IMPLEMENTED_AND_WORKING (long-only sizing) | Sizing assumes long entries; blocked earlier by the spot-account side gate. |
| `backend/src/trader/executor.ts`, `replay.ts`, `manager.ts` | IMPLEMENTED_AND_WORKING (long-only) | Explicitly reject short replays; unchanged. |
| `src/components/pages/MarketsPage.tsx` | PARTIALLY_IMPLEMENTED → **FIXED** | Two categories only; now all five with search. |
| `src/components/pages/WatchlistsPage.tsx` | PARTIALLY_IMPLEMENTED → **FIXED** | Category filter limited to crypto/commodity. |
| `src/components/pages/TraderDesk.tsx` | CONNECTED_BUT_MALFUNCTIONING → **FIXED** | Autopilot candidates were crypto-only. |
| `src/components/AdminPanel.tsx` | PARTIALLY_IMPLEMENTED → **FIXED** | Probe/restriction target lists were crypto/commodity only. |
| `src/components/pages/AlertsPage.tsx` | IMPLEMENTED_AND_WORKING | Already consumes `getTrackedMarkets()`; inherits the fix. |
| `src/components/pages/AILearning.tsx`, `backend/src/services/aiLearningJournal.ts`, research services | IMPLEMENTED_AND_WORKING | No crypto coupling found beyond the research route gate that was fixed. |
| `backend/src/services/marketCoverage.ts`, `src/lib/market-coverage.ts` | DEAD_OR_OBsolete | Removed in the preceding coverage-tier work. |
| Legacy coverage migrations, `paper_autopilot_coverage_tier_guard` | DEAD_OR_OBSOLETE | Trigger dropped by `20261102000000_market_access_restrictions.sql`; table retained for a verified rollout window. |

### 1.3 Confirmed defects fixed in this change

1. **Registry advertised a provider with no adapter.** `JP225`, `HK50`, `AUS200` were `provider: 'oanda'`, which no adapter serves. They now carry `provider: 'unsupported'` plus an operator note, remain discoverable, and are excluded from provider-supported surfaces.
2. **Stock mapping was indexed for the wrong provider.** `LiveSymbolMap` mapped `AAPL` into the Twelve Data index while the registry assigns stocks to Massive, so `internalSymbolFromTwelveData('AAPL')` returned a market that can never be streamed from that provider.
3. **Index mapping could be guessed.** The Massive resolver fell back to the bare symbol for indices; it now refuses to produce a mapping unless the registry declares an explicit `I:<TICKER>` source.
4. **Crypto/commodity-only analysis scope.** `validateDecisionRequest` rejected the other three classes.
5. **Crypto-only autonomy and planner selection.** `isAutopilotSymbol` and `selectVerifiedPlannerMarkets` required `marketType === 'crypto'` and `priceCurrency === 'USD'`.
6. **USD suffix check in the planner.** `input.symbol.endsWith('USD')` silently excluded `USDJPY`, `UK100`, `GER40`, `JP225`, `HK50`, `AUS200` regardless of capability.
7. **No session gate in paper execution or planning.** Non-crypto instruments could have been planned or filled outside exchange hours once the crypto-only gates were removed.
8. **Probe coverage limited to two asset classes.** Diagnostics could not inspect forex, indices, or stocks.

### 1.4 Security and data-integrity observations (unchanged, re-verified by reading)

- Paper execution remains backend-authoritative; no browser-supplied candles, balances, or risk decisions are trusted.
- Provider credentials stay server-side (`config.massiveApiKey`, `config.twelveDataApiKey`); the browser client only calls the authenticated backend.
- Response validation rejects mismatched instrument metadata for both adapters, plus non-positive, unordered, future-dated, and misaligned (crypto) bars.
- Explicit administrator restrictions (`market_access_restrictions`) and AAL2-protected admin routes remain in force.
- No database reset or destructive migration was performed.

### 1.5 Database migration requirements

None required for this change. Existing objects used: `market_access_restrictions`, `admin_set_market_access_restriction`, `paper_autopilot`, `research_*`. The previously added `20261102000000_market_access_restrictions.sql` remains the only pending migration and still needs a hosted-database apply + pgTAP run (NOT-VERIFIED).

---

## 2. Implementation report

### 2.1 `src/lib/marketCapabilities.ts` (new)

Single authority replacing eight scattered assumptions. Exposes `providerAdapterFor`, `resolveSourceSymbol`, `providerSupport`, `isProviderSupportedMarket`, `marketSessionModel`, `settlementCurrency`, `pricePrecision`, `tickSize`, `contractSize`, `supportsPlanSide`, `paperSettlementEligible`, `paperEligibilityReason`, `marketTypeLabel`, `defaultSessionTimezone`.

Design decisions:

- **Provider support** requires an implemented adapter *and* a resolvable source symbol. Missing either yields `supported: false` with a reason — never a fabricated mapping.
- **Paper eligibility** requires USD settlement (`priceCurrency`/`quoteAsset`) because the paper account is USD-denominated spot. This is what replaces the old blanket crypto check: stocks, US indices, commodities, crypto, and USD-quoted forex majors are eligible; `USDJPY`, `EURJPY`, `GER40`, `UK100`, `JP225`, `HK50`, `AUS200` are not, with an explicit reason.
- **Side eligibility** is instrument-declared; nothing is shortable today because the spot paper account cannot hold shorts.

Consumed by: registry helpers, `LiveSymbolMap`, `marketDataService`, `marketAvailability`, `decisions`, `trader` route, `paper-autopilot`, `planner`, `paperTradingService`, `config`, and the four UI surfaces.

### 2.2 Registry (`src/lib/markets.ts`, `src/lib/types.ts`)

- `Market` gains optional `instrumentType`, `tickSize`, `pricePrecision`, `contractSize`, `sessionTimezone`, `shortable`, `supportedTimeframes`, `providerNote`.
- `SUPPORTED_PRODUCT_MARKET_TYPES` is now all five classes; `isSupportedProductMarket` means *provider-supported*, not *category-allowed*.
- New helpers: `getProviderSupportedMarkets`, `getPaperTradableMarkets`, `getDiscoverableMarkets`, `getMarketProviderSupport`, `getMarketSettlementCurrency`, `getMarketTypeLabel`, `ALL_MARKET_TYPES`.
- `getTrackedMarkets()` returns every active provider-supported market instead of two categories.
- The three OANDA-assigned indices are no longer advertised against an adapter that does not exist.

### 2.3 Provider layer

- `LiveSymbolMap.ts`: provider-aware indexing; the Twelve Data index now contains only registry instruments assigned to Twelve Data.
- `marketDataService.ts`: one resolver call replaces three duplicated mapping rules in `probeMarketData` and `fetchMarketDataUncoalesced`; unchanged fail-closed validation and provenance.
- `marketAvailability.ts`: probeable set and status initialization use the resolver; `provider: 'unsupported'` plus the real reason is reported for unmapped instruments.

### 2.4 Access, autonomy, planner, execution

- `decisions.ts`: accepts any provider-supported instrument; rejects only unknown/unsupported markets with the specific reason.
- `trader.ts`: planner selection requires supported + USD-settled + verified; enrollment failures now explain the actual cause per symbol.
- `paper-autopilot.ts`: `isAutopilotSymbol` uses `paperSettlementEligible` + verified availability; explicit admin restrictions still filter eligibility.
- `planner.ts`: registry/provider/session checks replace the USD suffix gate; a bearish bias on a non-shortable instrument returns an explicit reason instead of a generic one.
- `paperTradingService.ts`: capability-based market gate plus `evaluateMarketSession(market, candleTime)` so exchange-traded fills cannot occur outside a configured session; crypto remains continuous.
- `config.ts`: default autonomy advisory symbols derive from paper-eligible markets.

### 2.5 UI

- `MarketsPage`: five categories, search, provider/status/quote state, no coverage tiers.
- `WatchlistsPage`: category filter covers all five classes.
- `TraderDesk`: autopilot candidate list from `getPaperTradableMarkets()`.
- `AdminPanel`: probe and restriction pickers from `getSupportedProductMarkets()`.
- `KineticCoach`: floating assistant moved from bottom-left to bottom-right, removing overlap with the developer performance overlay.

### 2.6 Tests added or updated

| File | Coverage |
| --- | --- |
| `src/lib/marketCapabilities.test.ts` (new, 7 tests) | Adapter + source resolution for all classes; unsupported provider; no index guessing; precision/tick/contract; session model; USD settlement eligibility incl. negatives; side eligibility. |
| `src/lib/markets.test.ts` | Five-class discovery, provider-supported exclusion, paper eligibility, tracked markets, registry uniqueness, no USDT mapping, source resolution for every supported instrument, no unimplemented adapter advertised. |
| `backend/src/domain/LiveSymbolMap.test.ts` | Stocks are not indexed for Twelve Data; provider isolation. |
| `backend/src/routes/decisions.test.ts` | Unsupported provider rejected; stocks/forex/indices/commodities all accepted. |
| `backend/src/routes/trader.test.ts` | Planner selection accepts AAPL/SPX500/XAUUSD/EURUSD; rejects JPY/EUR-settled and unsupported. |
| `backend/src/trader/planner.test.ts` | Unsupported instrument; exchange calendar required for non-continuous markets. |
| `backend/src/services/paperTradingService.test.ts` | Session gate blocks then allows an equity entry once a calendar is configured. |
| `backend/src/autonomy/paper-autopilot.test.ts` | Autopilot admits verified USD-settled instruments across classes; rejects JPY settlement and unsupported. |
| `backend/src/routes/market-availability.test.ts` | Probeable set spans all five classes and excludes unsupported providers. |
| `backend/src/services/marketDataService.test.ts` | Updated unsupported-adapter message. |

---

## 3. Final verification (actually executed)

| Check | Command | Result |
| --- | --- | --- |
| Unit + integration tests | `npm test` | **PASS** — 83 files, 522 tests |
| Frontend typecheck | `npm run typecheck` | **PASS** |
| Backend typecheck | `npm run backend:typecheck` | **PASS** |
| Lint | `npm run lint` | **PASS** |
| Production build | `npm run build` | **PASS** (existing >500 kB chunk warning) |
| Migration versions | `npm run check:migration-versions` | **PASS** — 58 unique versions |
| Provider probes | — | **NOT RUN** (no credentials/live network in this environment) |
| Hosted database migration / pgTAP | — | **NOT RUN** |
| Browser/UI runtime check | — | **NOT RUN** |

## 4. What remains unproven or unimplemented

1. **Per-instrument live verification.** No instrument has been proven end-to-end against a real provider in this environment. Registry mapping ≠ provider entitlement. Massive/Twelve Data symbol availability, index entitlements, and forex/stock entitlements must be probed per instrument with the admin probe before any class is claimed working.
2. **Non-crypto session calendars.** `MARKET_SESSION_CALENDAR_JSON` is empty by default; exchange-traded entries and plans are correctly blocked until an operator configures venue calendars (holidays, DST, auctions). No calendar data was invented.
3. **Short paper plans.** `PlanSide` supports `short`, but the paper account is spot long-only. Instruments declare `shortable`; all are false. Executing shorts requires a margin/short-capable paper account and direction-aware risk sizing — deliberately not enabled.
4. **FX conversion for non-USD settlement.** `USDJPY`, `GER40`, `UK100`, `JP225`, `HK50`, `AUS200` are chart/analysis-ready but not paper-tradable until USD conversion exists.
5. **Provider capability matrix.** Intervals, historical depth, streaming support, and entitlement per instrument are not asserted anywhere; only the adapter's code-level capability is known.
6. **Chart annotation contract (evidence-linked IDs, invalidation, expiry).** Not extended here; the current chart draws candles, theme, and stored plans only.
7. **Provider fallback/streaming tests.** Rate-limit, auth failure, empty/invalid response, mismatch, and stale paths exist; streaming disconnection and polling recovery were not re-verified.
