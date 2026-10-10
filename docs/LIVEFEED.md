# Live Feed

Streamed prices are display-only. Trading decisions use closed candles from the REST path (Massive), and streamed prices may differ slightly from those candles.

## Provider table

| Provider | Role | Endpoint | Auth | Checked | Status |
|---|---|---|---|---|---|
| Coinbase Advanced Trade | Crypto USD pairs (`<BASE>-USD`) | `wss://advanced-trade-ws.coinbase.com` | None for public channels | 2026-10-10 | Adapter built; live connection verified for BTC-USD and ETH-USD |
| Twelve Data | Forex, commodities, stocks | Not yet implemented (Phase C) | Server-side key | Not yet checked | Not started |

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
- Sequence numbers are tracked per channel within a connection. Messages with a sequence at or below the last one seen are dropped as `duplicates`.
- Reconnect uses exponential backoff with jitter, from 1 second up to 30 seconds. Subscriptions are resent on reconnect.
- A connection with no inbound message for `LIVE_FEED_STALE_MS` is closed and reconnected.
- Status is `connected` after open, `reconnecting` while waiting to retry, and `down` when no symbols are subscribed or after `close()`.
- Symbols Coinbase does not list are not detected by the adapter. The static map covers the USD crypto registry entries. A symbol with no ticks is shown as stale by the UI layer, not Live.

## Known gaps

- The Node runtime needs a global `WebSocket` (Node 22 or later). `package.json` allows Node 20.19, so live streaming should not be enabled on Node 20 without adding a WebSocket client.
- Not verified: whether every mapped crypto product (for example `POL-USD`) exists on Coinbase.
- Not verified: the `candles` cross-check and the candles `start` unit.

## Disabling streaming

Set `LIVE_FEED_ENABLED=false` (the default). The app then uses REST polling only.

## Terms

Each provider's free-tier terms (display, redistribution, commercial use) must be reviewed by the owner before the app is opened to other users. This has not been decided.
