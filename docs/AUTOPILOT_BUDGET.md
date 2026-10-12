# Autopilot request and ledger budget

The defaults are `MASSIVE_REQUESTS_PER_WINDOW=5` per `MASSIVE_BUDGET_WINDOW_MS=60000`, with `MASSIVE_TRADER_RESERVED_REQUESTS=2` reserved for trader work. The request spacing is derived as `ceil(windowMs / min(requestsPerWindow, reservedRequests))`; with defaults this is 30,000 ms. Doubling the quota and reserved share halves spacing. Configure paid provider plans through these environment values; there is no hard-coded scheduler spacing constant.

The default frames are planner `1d,4h`, triggers `15m,1h`, and management `5m`. A cold midnight UTC cycle for three distinct symbols can request all five frames per symbol: 15 fetches and 14 inter-request waits, or **7 minutes** of spacing at defaults, plus provider latency. The scheduler fetches management series first, trigger series second, and planner series last so stop checks get the earliest data. Warm process-local cache hits do not cause provider fetches or spacing. This is an upper bound for a cold cycle; other users sharing those same symbols can share each fetch in one process. Multiple replicas do not share the cache or request budget.

## Ledger measurement

Run `node scripts/measure-paper-ledger.mjs` to reproduce the scripted workload: three symbols, one open position, 288 closed 5-minute candles per symbol (24 hours). The script measures UTF-8 JSON payload bytes, excluding PostgreSQL row, index, and WAL overhead.

| Model | Ledger rows | JSON payload bytes written |
| --- | ---: | ---: |
| Full account snapshot on each of 864 candle checkpoints | 864 | 341,187 |
| One initial snapshot plus one `NO_TRADE` decision event per candle | 865 | 167,919 |

The event model keeps the hash chain and avoids copying the evolving account state on checkpoint-only updates. A daily snapshot and snapshots when a trade opens or closes add rows when those conditions occur; the measurement’s baseline and event payload fixtures are deliberately explicit and repeatable.

Ledger events represent plan events, orders, fills, exits, journal entries, reviews, and meaningful gate decisions. Checkpoint-only state changes write no event. Repetitive `NO_TRADE` rows older than **30 days** should be compacted into a summary row; preserve detailed reasons for traded and blocked decisions. The current append-only ledger migration does not yet implement that compaction, so storage growth still needs monitoring before long-running broad enrollment.

Snapshots are written at account creation, at most daily, and when trades open or close. The SQL transaction keeps account state and event writes atomic. The hash chain detects tampering by parties who cannot rewrite the whole chain; a database owner able to rewrite all rows can rebuild it. Optionally export or audit-log the latest account hash daily outside the database.

`MGMT_TIMEFRAME` is `z.literal('5m')`: stop and target management uses completed five-minute candles, avoiding lookahead and the much larger provider load of one-minute per-position checks. It blocks configuring a different management timeframe until candle ordering, stop-first behavior, and the request budget are revalidated.

The owner must first export `paper_sim_accounts` as a backup, then apply `supabase/migrations/20261015000000_quantum_paper_core.sql` and follow [DB_APPLY.md](DB_APPLY.md). The migration was not applied to a remote project by this application.

## Priority 1m fetch audit

- `backend/src/routes/trader.ts`: `/overview` fetches 1m bars only to mark open positions for display; it does not evaluate stops or mutate a position.
- `backend/src/services/decisionService.ts`: 1m bars are used for a decision-analysis mark-to-market snapshot.
- `backend/src/services/paperTradingService.ts`: manual close obtains the latest quote; this is user-initiated.

Scheduled unattended stop/target management uses closed 5m bars, not 1m requests per position.
