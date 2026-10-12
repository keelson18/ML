# Autopilot request budget

Budget inputs from the current backend defaults:

- Massive: `MASSIVE_REQUESTS_PER_WINDOW=5` requests per `MASSIVE_BUDGET_WINDOW_MS=60000`.
- Trader priority reserve: `MASSIVE_TRADER_RESERVED_REQUESTS=2` requests per window.
- Twelve Data: `TWELVEDATA_REQUESTS_PER_WINDOW=8` per minute; the selected default autopilot symbols are Massive crypto markets, so Twelve Data is not used by these cycles.
- HTF timeframes: `4h,1d`; trigger timeframes: `15m,1h`; management timeframe: `5m`.
- Scheduler fetches up to 1,000 candles per symbol/timeframe. Identical symbol/timeframe/limit requests share the process-local TTL cache and in-flight request.

Each scheduled close requires one provider request per unique symbol/timeframe series. Per symbol:

| Series | Closes/hour | Requests/hour |
| --- | ---: | ---: |
| 1d planner | 1/24 | 0.0417 |
| 4h planner | 1/4 | 0.25 |
| 15m trigger | 4 | 4 |
| 1h trigger | 1 | 1 |
| 5m management | 12 | 12 |
| **Total** |  | **17.2917** |

`N` distinct symbols therefore cost approximately `17.2917 × N` requests/hour when shared cache entries are warm and the scheduler does not refetch a series during local replay. Two users enrolled on the same symbol share that fetch on one backend process; a second user adds zero provider requests for that already-fetched series. Cache sharing is process-local, not cross-replica.

The two-request priority reserve yields a conservative trader allocation of `2 × 60 = 120` requests/hour. `floor(120 / 17.2917) = 6` symbols would fit by average rate, before other priority work; the enforced product limit is lower: five distinct symbols globally (at most 86.46 requests/hour), enforced transactionally by the autopilot enrollment RPC. The per-user cap is `AUTOPILOT_MAX_SYMBOLS_PER_USER=3`. This is an average-rate budget, not a guarantee that other priority consumers cannot exhaust a rolling window. On exhaustion, entries pause with a visible reason; management resumes from fresh data and replays available closed bars in order, with stop-first candle rules.

The scheduler requests each series once with the common 1,000-bar limit, then filters and replays local closed-candle prefixes. It never makes a request per missed candle. New provider fetches are spaced by 12.5 seconds by default, while cache hits do not incur the delay. The manual Refresh plans action is limited to the account's selected symbols (at most three) and is rate-limited to once per minute; a cold scan can require up to three series per symbol. The market-data cache is keyed by symbol, timeframe, and limit, so keeping that common limit is important for reuse. Multiple backend replicas do not share cache or budget counters; deploy one scheduler worker per Supabase project until shared coordination exists.

Automatic scheduler startup is disabled unless `AUTONOMOUS_TRADING=true`; each account must also explicitly opt in. Authenticated Run now remains available for an opted-in account when scheduled processing is disabled.

The owner must apply `supabase/migrations/20261014000000_quantum_paper_core.sql` before enabling accounts. The migration backfills existing account snapshots idempotently and introduces the service-role-only account/ledger transaction RPC; no remote migration was run by the application.

## Priority 1m fetch audit

- `backend/src/routes/trader.ts`: the `/overview` endpoint fetches 1m bars only to mark open positions for display; it does not evaluate stops or mutate a position.
- `backend/src/services/decisionService.ts`: 1m bars are used for a decision-analysis mark-to-market snapshot, not position management or order execution.
- `backend/src/services/paperTradingService.ts`: manual close obtains the latest available quote; this is a user-initiated close, not the unattended stop-check path.

Scheduled and automated stop/target management uses only closed 5m bars. It does not fetch 1m bars per open position.
