# Chart performance baseline

Status: **NOT-VERIFIED.** No production-build browser measurement was possible in this session (the preview screenshot and browser tooling were unavailable), and the Massive plan facts have not been provided by the owner. The numbers below are placeholders to fill in from the procedure, not results.

## Instrumentation added

| Signal | Where | How to read it |
| --- | --- | --- |
| `Server-Timing: provider;dur=…, total;dur=…` | `backend/src/routes/market.ts` on `/api/v1/market/candles/:symbol` | DevTools → Network → response headers. A provider time near 0 ms indicates the backend served from cache. The browser only exposes this header to cross-origin pages when the backend sends `Timing-Allow-Origin`; same-origin use works without it. |
| Structured log `market candles served` | same route | `providerMs`, `totalMs`, `bytes`, `candles`, `symbol`, `timeframe`. No secrets are logged. |
| `candles.fetch`, `chart.candles`, `chart.overlays` timings | `src/lib/perf.ts`, `src/components/Dashboard.tsx`, `src/components/PriceChart.tsx` | Shown in the performance overlay. |
| Performance overlay | `src/components/PerfOverlay.tsx` | Add `?perf=1` to the URL. Visible only to admins or in development builds. Shows bars, FPS, long-task count, last fetch, and chart update timings. |

## Changes that affect the numbers

- `PriceChart` applies only the changed tail of the candle series on live ticks, using `series.update`. It calls `setData` only on first load, a symbol or timeframe change, a history rewrite, or a shrink (`src/lib/chart-feed.ts`).
- Overlay series are kept by key and updated in place. Markers are re-set only when their content changes.
- Live ticks update the candle ref immediately, but React state is set at most once per animation frame. The full candle array is still copied per tick, so this is a reduction in re-render work, not elimination.
- The accessibility table and description update at most once per second.

## Procedure to record a baseline

1. Build for production: `npm run build && npm run preview`. Do not measure under `npm run dev` (StrictMode runs effects twice).
2. Open the app signed in as an admin with `?perf=1`. Choose one crypto symbol and the `1h` timeframe.
3. Record, from a cold reload and then from a warm reload:
   - time to first candle paint (Performance panel, or the `candles.fetch` value);
   - symbol switch to first paint, which should be repeated five times and the median kept;
   - live update latency, from the stream or poll arrival to the painted bar;
   - payload bytes for `/api/v1/market/candles/…` (Network panel);
   - HTTP 429 count over a five-minute session of switching symbols and opening Markets and Watchlist;
   - long tasks per minute (overlay counter).
4. Enter the numbers in the table below with the date, build commit, and browser.

| Metric | Before (Phase 1) | After Phase 2 | Notes |
| --- | --- | --- | --- |
| First candle paint, cold | NOT-VERIFIED | NOT-VERIFIED | |
| Symbol switch, warm cache | NOT-VERIFIED | NOT-VERIFIED | |
| Live bar update latency | NOT-VERIFIED | NOT-VERIFIED | Polling every 30 s until the streaming phase is built |
| Candle payload bytes (1000 bars) | NOT-VERIFIED | NOT-VERIFIED | |
| 429 responses in five minutes | NOT-VERIFIED | NOT-VERIFIED | |
| Long tasks per minute | NOT-VERIFIED | NOT-VERIFIED | |

## Massive plan facts (owner to supply)

These determine whether true streaming is possible. They have not been assumed.

- Real-time or delayed data:
- WebSocket entitlement:
- Requests-per-minute limit:

Until these are supplied, the streaming work treats the feed as unverified and falls back to short server-side polling.
