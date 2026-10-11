# Live Feed

Streamed prices are display-only. Trading decisions use closed candles from the REST path (Massive), and streamed prices may differ slightly from those candles.

## Provider table

| Provider | Role | Endpoint | Auth | Checked | Status |
|---|---|---|---|---|---|
| Coinbase Advanced Trade | Crypto USD pairs (`<BASE>-USD`) | `wss://advanced-trade-ws.coinbase.com` | None for public channels | 2026-10-10 | Adapter built; live connection for BTC-USD and ETH-USD NOT-VERIFIED (no verification steps on record) |
| Massive | Crypto history and closed candles (`X:<BASE>USD`), REST only | `https://api.massive.com` | Server-side key in `Authorization` header | 2026-10-11 | Budgeted: free Basic tier is 5 requests per minute per asset class; paid tiers unlimited for that class (Massive knowledge base) |
| Twelve Data | Forex, commodities, stocks | `https://api.twelvedata.com` (REST); no streaming feed registered | Server-side key | Not yet checked | REST adapter and symbol map exist; stream not wired; REST calls use a request budget; not verified against the live API |

Sources for the Coinbase row: Coinbase Advanced Trade WebSocket channels and overview pages (docs.cdp.coinbase.com, `coinbase-app/advanced-trade-apis/websocket`).

## Coinbase channels used

- `ticker`: price updates on each match, subscribed per product. Ticks are read from `events[].tickers[]` (`product_id`, `price`), with the message-level RFC 3339 `timestamp`.
- `heartbeats`: subscribed once per connection. Pings about every second, used to keep the connection alive and to detect staleness.
- `candles` (5-minute buckets, updated about every second): not subscribed yet. Forming candles are built from ticks, so the 5-minute channel is not needed for display. A cross-check against it is not implemented.

Each subscribe message covers one channel. The subscribe payload is `{ type: "subscribe", channel, product_ids }`. A subscribe must arrive within 5 seconds of connecting, so subscriptions are sent on open.

## Limits found and not found

- Found: heartbeat about 1 second; candles updated about every second; most channels close after 60 to 90 seconds without updates when no heartbeat is subscribed.
- Not found on the pages read: products per connection, message rate, connection lifetime cap, candles `start` units (seconds or milliseconds), and the exact message shape for `snapshot` and `update` events.
- `LIVE_FEED_MAX_SYMBOLS` (default 20) is our own cap, not a Coinbase limit.

## Behaviour implemented

- Messages are parsed and validated with zod. Unparseable or unexpected messages are counted as `malformed` and ignored; their payloads are never logged.
- Ticker sequence numbers are tracked per product within a connection, because Coinbase's overview defines them per product (docs.cloud.coinbase.com, `advanced-trade/docs/ws-overview`, read 2026-10-11). A sequence at or below the last one seen for that product is dropped as `duplicates`.
- A sequence more than one above the last one seen is counted as `gaps` and logged with the product ID and the number of messages missed. Missed ticks are not replayed; the next tick for that product is used as the current price.
- Reconnect uses exponential backoff with jitter, from 1 second up to 30 seconds. Subscriptions are resent on reconnect.
- A connection with no inbound message for `LIVE_FEED_STALE_MS` is closed and reconnected.
- Coinbase's ticker has no volume, so forming candles carry `volume: null`. The UI must not draw a volume bar for a forming candle.
- Status is `connected` after open, `reconnecting` while waiting to retry, and `down` when no symbols are subscribed or after `close()`.
- Symbols Coinbase does not list are not detected by the adapter. The static map covers the USD crypto registry entries. A symbol with no ticks is shown as stale by the UI layer, not Live.

## Client

- `src/lib/providers/stream-client.ts` fetches a ticket, opens one shared socket, and subscribes per symbol and timeframe. Only the forming candle is streamed; closed candles still come from REST polling, which keeps running.
- The header shows **Live** only while the server reports the symbol as `stream`. REST-only operation shows **Polling**.
- Streamed forming candles set `volume: 0` because the client `Candle` type needs a number. They replace the REST forming bar until the next REST bar. No chart draws volume today.
- Not browser-tested in this session.

## Known gaps

- The socket uses the `ws` package, so it does not need Node 22's global `WebSocket`. `package.json` still allows Node 20.19. Not run on Node 20.19 in this session.
- Not verified: whether every mapped crypto product (for example `POL-USD`) exists on Coinbase.
- Not verified: the `candles` cross-check and the candles `start` unit.

## Verification

- Live connection for BTC-USD and ETH-USD: **NOT-VERIFIED.** The repository has no recorded test, script, or log for a live Coinbase connection. The earlier "verified" statement had no supporting steps and is withdrawn until the steps are supplied and rerun.
- Covered by unit tests with a fake socket only: subscribe, ticks, malformed and duplicate handling, gap counting, per-product sequencing, reconnect, and stale detection.

## Massive request budget

- Limits are config, not constants: `MASSIVE_REQUESTS_PER_WINDOW` (default 5, the free Basic tier at the date above), `MASSIVE_BUDGET_WINDOW_MS`, `MASSIVE_BUDGET_MAX_WAIT_MS`, `MASSIVE_BUDGET_MAX_QUEUE`. Set the window quota to your plan's limit.
- Every server-side Massive request, including the market availability probe and autonomy reads, takes a slot from one shared budget. Browsers never call Massive.
- A request that cannot get a slot within `MASSIVE_BUDGET_MAX_WAIT_MS` fails with 429 and `Retry-After`, without calling Massive. If a cached series is still inside its stale bound, that series is served instead.
- A Massive 429 pauses all Massive requests for its `Retry-After` (or one window if the header is absent).
- Twelve Data REST calls use a separate budget: `TWELVEDATA_REQUESTS_PER_WINDOW` (default 8 per `TWELVEDATA_BUDGET_WINDOW_MS`, set to the free-tier per-minute limit the owner gave), with its own wait and queue limits. A Twelve Data 429 pauses only Twelve Data. Twelve Data's daily caps are not enforced here.
- Admin: `GET /api/v1/admin/markets/budget` returns quota, usage in the current window, queued requests, and any active backoff.
- Not built: a dedicated background poller per symbol and timeframe. Requests are cached and coalesced on demand instead. The budget counts all Massive requests in one server process; Massive counts per asset class, so a separate budget is needed if stock requests are added.

## Disabling streaming

Set `LIVE_FEED_ENABLED=false` (the default). The app then uses REST polling only.

## Terms

Each provider's free-tier terms (display, redistribution, commercial use) must be reviewed by the owner before the app is opened to other users. This has not been decided.
