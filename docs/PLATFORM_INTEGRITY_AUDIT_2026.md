# Platform Integrity & Architecture Audit

**Date:** 2026-11-01 (verified against HEAD `de50656`)
**Method:** Static reading of source + execution of `vitest`, `tsc`, `npm run build`.
**Rule:** Every finding carries file path, relevant code, affected execution path, severity,
root cause, and verification status (VERIFIED / PARTIAL / NOT-VERIFIED).

Legend: severity — **Critical** / **High** / **Medium**. Status — **VERIFIED** (reproduced here),
**PARTIAL** (code read, runtime not exercised), **NOT-VERIFIED** (needs DB/Docker/provider).

---

## AREA 1 — Market data architecture (Critical)

**Provider abstraction — HEALTHY.** `backend/src/services/marketDataService.ts` routes through a
provider registry (`massive`, `twelvedata`), validates responses, attaches provenance
(`dataset.id`, `dataVersion`, `sourceInstrument`, `quoteCurrency`), and fails closed.

- F-1.1 (Medium, VERIFIED) — **Registry contains instruments the data service cannot serve.**
  `src/lib/markets.ts` lists indices with `provider: 'oanda'` (JP225, HK50, AUS200). `fetchMarketData`
  throws `No supported market-data adapter is configured` for these. Execution path: any UI request for
  these symbols → 502/error. Root cause: registry advertises unsupported providers.
  **RESOLVED 2026-11-05:** the three instruments now declare `provider: 'unsupported'` with an operator
  note; they remain discoverable but are excluded from every provider-supported surface.
- F-1.2 (High, VERIFIED) — **`getTrackedMarkets()` is crypto-only.**
  `src/lib/markets.ts`: `export function getTrackedMarkets() { return getMarketsByType('crypto'); }`
  Hardcoded restriction. Root cause: leftover single-market-type assumption.
  **RESOLVED 2026-11-05:** returns every active provider-supported market across all five classes.
- F-1.3 (High, VERIFIED) — **Decision scope rejects forex/index/stock.**
  `backend/src/routes/decisions.ts`: `if (market.marketType !== 'crypto' && market.marketType !== 'commodity') return '...outside the supported crypto and commodities scope.'`
  Test `decisions.test.ts` locks this (`AAPL`, `EURUSD` → 400). Intentional but must be a documented product decision.
  **RESOLVED 2026-11-05:** scope now follows provider capability; only markets without an adapter are rejected.
  See [FIVE_ASSET_RESTORATION_REPORT_2026-11-05.md](FIVE_ASSET_RESTORATION_REPORT_2026-11-05.md).
- Provider health, rate-limit budgets, stale-cache fallback: present and well-modeled (`providerBudget.ts`, `returnStaleOrThrow`).

## AREA 2 — Candle integrity (Critical)

**No synthetic/fake candle generation found in the production data path** (grep for `Math.random`
returns only test fixtures / ML label code). Validation in `validateCandles()` rejects NaN, future
candles, misaligned crypto bars, non-positive prices, and disorder.

- F-2.1 (Medium, PARTIAL) — **`aggregateThreeMinuteCandles` may emit a partial 3m bar as closed.**
  `marketDataService.ts`: `finish()` pushes when `count === 3 || intervalIsOpen`. An in-progress
  interval is emitted with `forming` semantics not marked; downstream `selectClosedCandles` filters by
  time, but the aggregator itself can produce a 3-bar-max candle whose source minutes are incomplete if a
  minute is missing mid-interval (it resets to `undefined` — good) yet still flushes a 1–2 minute partial
  as a bar when `intervalIsOpen`. Verify boundary behavior with a dedicated test.
- Provenance (`dataVersion` content hash), TTL cache, in-flight de-dup: present.

## AREA 3 — Decision engine & BUY/SELL timing (Critical)

**Strong.** Pipeline enforces closed-candle selection (`selectClosedCandles`), freshness/staleness
gates, per-candle idempotency (`markCandleProcessed` / `wasCandleProcessed`), and market-bias ≠ entry
(`masterDecisionEngine` stages: setup/entry/risk/final). `decisions.test.ts` rejects browser-supplied
candles and blocks stale/too-old data.

- F-3.1 (Medium, VERIFIED) — **Undocumented direction-source change** (from `e361049`): `decision-engine.ts`
  now derives deterministic direction from all-signal `biasScores` instead of `selectedScores`, while
  `hasDirectionalEvidence` still uses selected. This widens market bias influence into the contradiction
  and confidence engines. Root cause: behavioral change shipped under a "reporting" commit message.
- F-3.2 (Low, VERIFIED) — `confidenceBreakdown` typed optional in `BackendDecision` but always populated;
  tighten to non-optional (or keep optional only on the wire).

## AREA 4 — Instrument management (Critical)

See F-1.1, F-1.2, F-1.3 (all resolved 2026-11-05). Also: `planner.ts` gated on `symbol.endsWith('USD')`
and `bias === 'bull'` (long-only) — **RESOLVED 2026-11-05:** replaced by provider/session/settlement
capability checks; the long-only limitation is now declared per instrument (`supportsPlanSide`) instead of a
symbol-string assumption.

## AREA 5 — AI architecture (High)

Engines are modular and non-authoritative by contract (`ai-reasoning-engine` returns
`authoritative:false`). ML evidence is downgraded when lineage is incomplete (`ml-engine.ts` test).
- F-5.1 (Medium, PARTIAL) — Confidence is surfaced in the UI as "heuristic · not calibrated" (good), but
  ensure no surface labels it a probability. `confidenceBreakdown` factors include `model-calibration`
  fixed at 0.5 when uncalibrated — correct.

## AREA 6 — Strategy & indicators (High)

- F-6.1 (High, VERIFIED) — **Bollinger removal NOT completed.** `src/lib/strategies/library.ts` still
  registers `volatility-breakout` (uses `bollinger(...)`), and `src/lib/strategies.test.ts` asserts
  `bollinger-volatility` in the published set. Direction doc (`docs/quant-update.md`) says remove Bollinger
  engine without touching other indicators. Root cause: cleanup scheduled but not executed; tests now
  *lock in* the un-removed state.
- Strategy registry has eligibility/warm-up guards (`getIneligibilityReason`, `minCandles`).

## AREA 7 — Multi-timeframe (High)

Config is explicit and validated: `HTF=4h,1d`, `SETUP=1h`, `TRIGGER=15m,1h`, `MGMT=5m`
(`backend/src/trader/config.ts`). Planner enforces chronological alignment (`setupClose > triggerClose`
etc. → "not chronologically aligned"). Documented in `docs/multi-timeframe-audit.md`.
- F-7.1 (Low) — Planner only validates the first trigger timeframe (15m); legacy 1h path retained. Confirm no
  1h-triggered plan bypasses the 15m confirmation.

## AREA 8 — Paper trading & execution (Critical)

**Backend-authoritative and strong.** `paperTradingService.ts` runs all gates server-side
(availability, promoted setups, RR, daily/weekly loss, drawdown, correlation, heat), uses optimistic
versioning + atomic ledger RPC (`record_paper_account_update`), idempotent checkpoints, shadow mode,
and append-only decision ledger with hash chain.
- F-8.1 (Low, PARTIAL) — `Market is unavailable...` gate relies on in-memory `getMarketAvailability()`;
  after restart state is `unverified` → entries blocked (fail-closed, acceptable) but operators must re-probe.

## AREA 9 — AI Learning & research (High)

`learning-engine.ts` rejects caller-supplied validation booleans without reproducible evidence and keeps
candidates non-promoting. Research requires fresh data (`learning-research.ts` 503 on stale).
- F-9.1 (Medium, VERIFIED) — Frontend `src/components/pages/AILearning.tsx` is **corrupted** (see Area 10/16),
  so the learning UI cannot render. Backend is fine.

## AREA 10 — Frontend & UI/UX (High) — **BLOCKING**

- F-10.1 (Critical, VERIFIED) — **Three files corrupted by commit `1f083d5`.**
  - `src/components/pages/AILearning.tsx`: 27,728 B → 2,276 B (imports, component, helpers deleted).
  - `src/components/AutonomousCommandCenter.tsx`: 10,943 B → 9 lines.
  - `src/index.css`: 52,030 B → 34 lines.
  Execution path: `npm run build` → `[vite:css] src/index.css:26:1: Unexpected }`. App cannot ship.
  Root cause: an automated tiny-text edit deleted file heads instead of replacing `text-[11px]`.
  Verification: reproduced (`npm run build`, `tsc -p tsconfig.app.json` → TS1128/TS1109).

## AREA 11 — Charting (High)

- Related to F-10.1 (broken build blocks chart). Chart data path uses validated backend candles;
  `getNewlyClosedCandles` only yields completed bars. No fake candles in chart feed found.

## AREA 12 — Database & persistence (Critical)

`getSupabaseClient` / token-scoped / anon clients are correctly separated (`backend/src/db.ts`); server
key validated via `isSupabaseServerKey`. Migrations are forward-only with pgTAP tests
(`supabase/tests/*`). **No DB reset performed** (out of scope; hosted DB untouched).
- NOT-VERIFIED: migration application to hosted DB, RLS behavior, ledger RPC under concurrency
  (no Docker/Supabase CLI in this workspace).

## AREA 13 — Backend & API (High)

Routes validate input (`validateDecisionRequest`), reject browser candles, rate-limit, cache per user.
- F-13.1 (Medium, PARTIAL) — Business logic lives in `services/*` (good), but `decisions.ts` also contains
  research-context + journal orchestration inline; acceptable but consider extraction.

## AREA 14 — Security (Critical)

- F-14.1 (Info, VERIFIED) — `.env` is gitignored (`.gitignore:23`) and **never committed**
  (`git log --all -- .env` empty). No secret in history. `.env.example` exists (not read per policy).
- Auth/RBAC: `requireAuth`/`requireAdmin` decorators, MFA in migrations/tests, service key guarded.
- F-14.2 (Low, PARTIAL) — Journal sanitizer redacts tokens/URLs/emails; good. Confirm no other log site prints raw provider payloads.

## AREA 15 — Performance & reliability (High)

Cycle budgets (`providerBudget.ts`), request de-dup, TTL cache, `BoundedMap`/`WindowLimiter` exist.
- F-15.1 (Medium, VERIFIED) — **Tests perform real network calls.** `decisions.test.ts` does not mock
  `getApprovedResearchContext`/`appendAiLearningJournalEvent` → each request hits Supabase. Under
  `--maxWorkers=4` this caused a 5s timeout (`server-side decision analysis > analyzes an unverified market
  ...`). Root cause: unmocked I/O in test; flaky under load. Passes in isolation (~850ms/that test).

## AREA 16 — Testing, deployment, monitoring (High)

- F-16.1 (High, VERIFIED) — Full suite: **503 passed, 1 failed** (timeout above). Build **FAILS**. Typecheck
  of app **FAILS** (F-10.1). CI (`ci.yml`) runs typecheck/lint/build → current HEAD cannot pass CI, meaning
  the broken commit was pushed without a green pipeline.
- Monitoring hooks exist (server-timing, observability tests).

---

## Consolidated priority (evidence-backed)

1. **F-10.1** — Restore 3 corrupted files from `07166a1`, re-apply tiny-text change by hand. Blocks build.
2. **F-15.1 / F-16.1** — Mock Supabase in `decisions.test.ts`; make suite deterministic; fix CI gate bypass.
3. **F-6.1** — Finish Bollinger removal *or* rescind the requirement; update `strategies.test.ts`.
4. **F-1.1 / F-1.2 / F-1.3** — Remove `oanda` instruments or add adapter; delete `getTrackedMarkets` crypto-only
   or rename; document crypto/commodity decision scope as a product decision.
5. **F-3.1** — Document the `biasScores` direction change; align `confidenceBreakdown` optionality.
6. **F-2.1 / F-7.1** — Add aggregation partial-bar test; confirm no legacy 1h-trigger bypass.

## What is already healthy (do not regress)
- Provider abstraction + provenance + fail-closed validation.
- Backend-authoritative paper execution with idempotency + hash-chained ledger.
- Closed-candle enforcement and bias≠entry decision staging.
- Secrets hygiene (`.env` never committed; server key guarded).
