# Quantum Intelligence — Fix Plan

Repo: `keelson18/ML` · Written 2026-10-03

**Status key:** ✅ done in `quantum-fixes.patch` · 🔧 still to do (steps below) · ❓ needs your decision

> **Not verified:** I could not run `tsc`, ESLint or the tests (package install was blocked with a 403).
> Run the checks in section 4 before you commit.

---

## 0. Apply the patch

From the root of your clone:

```bash
# Apply the 5-file patch (signal timing, error handling, CORS, autonomy opt-in)
git apply quantum-fixes.patch

# If it complains about whitespace / line endings (this repo mixes CRLF and LF), use:
git apply --ignore-whitespace quantum-fixes.patch
```

Review with `git diff`, then commit and push yourself.

---

## 1. Fixed in the patch ✅

### 1.1 Signals fired when a new candle opened
**Cause.** Strategies ran on `candles`, which includes the still-forming candle and changes on every tick.
A new candle starts as open = high = low = close with almost no volume, so the first tick can flip the signal.

| File | Change |
| --- | --- |
| `src/components/Dashboard.tsx` | `runAllStrategies`, `combineSignals`, `riskLevels` now use `decisionCandles` (closed candles only). The ML refresh also keys off `decisionCandles.length`, so it fires on close, not on open. |
| `src/lib/useAutonomousTrading.ts` | New `analysisCandles` state that only grows when the stream reports `closed`. `runAnalysis` uses it, and the auto-run effect depends on its length. Before, the effect depended on `runAnalysis`, which changed every tick, so the whole engine pipeline re-ran on every tick. |

**Already correct (no change needed):** the backend `autonomy/pipeline.ts` analyses `series.slice(0, -1)` and de-duplicates per closed candle, and the Dashboard's server decision already used closed candles.

**Trade-off to know about.** Signals now update once per candle close, so on 15m a signal can be up to 15 minutes behind the live price.
If you ever want earlier hints, show them as a clearly labelled "forming" preview, never as BUY/SELL.

### 1.2 Raw errors returned to clients (`backend/src/routes/decisions.ts`)
- Request body is validated first: symbol pattern, known timeframe, 60–2000 candles, every candle field finite.
- Invalid input → `400` with a fixed message, plus a `warn` log line with the user id (useful for spotting probing).
- Unexpected failures → `500 { error: 'Analysis failed.' }`; the real error goes to the server log only.
- `/autonomy/run` no longer throws on a missing body (`request.body ?? {}`), which used to leak a TypeError message.

### 1.3 CORS reflected any origin (`backend/src/server.ts`)
`origin: true` is replaced by the `CORS_ORIGIN` list (comma-separated). Default for local dev is `http://localhost:5173`.
**In production the server now refuses to start without `CORS_ORIGIN`.** Set it in your deployment.

### 1.4 Autonomous trading was on by default (`backend/src/server.ts`)
It only starts when `AUTONOMOUS_TRADING=true`. `.env.example` now documents this.
If you relied on the old default, add `AUTONOMOUS_TRADING=true` to your `.env`.

---

## 2. Still to fix 🔧 (priority order)

### 2.1 Risk check runs on a fake trade — `src/lib/useAutonomousTrading.ts` (~lines 49–54, 139–142)
Only `entryPrice` is overwritten; the stop (99) and take-profit (102) stay hardcoded, so for BTC at 60,000 the risk engine sees nonsense.
The backend (`decisionService.ts:43`) already does this correctly.

```ts
// Scale stop and target from the real entry price (same 1% / 2% defaults the backend uses),
// instead of the hardcoded 99 / 102 that only made sense when the price was 100.
const risk = {
  ...DEFAULT_RISK,
  trade: {
    ...DEFAULT_RISK.trade,
    entryPrice,
    stopLossPrice: entryPrice * 0.99,
    takeProfitPrice: entryPrice * 1.02,
    portfolioValue: accountRef.current.cash,
  },
};
```

Also at ~line 156: `featureSnapshot: { rsi: 50, atr: 0.02 }` is invented data fed to the ML engine.
Pass real indicator values, or leave `featureSnapshot` out until you have them (check what `ml-engine.ts` requires).

### 2.2 Autonomy start/pause are stubs — `src/lib/backend-api.ts` (lines 37–46)
They return local fake state, so the UI says "MONITORING" without contacting the server.

```ts
// Call the real API instead of returning a local fake state. Needs the signed-in user's token.
const API_URL = import.meta.env.VITE_BACKEND_URL as string;

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in');
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function fetchAutonomyStatus(): Promise<AutonomyStatus> {
  const res = await fetch(`${API_URL}/api/v1/autonomy/status`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`Status request failed (${res.status})`);
  return res.json() as Promise<AutonomyStatus>;
}

export async function setAutonomyState(action: 'start' | 'pause'): Promise<AutonomyStatus> {
  // start/pause are admin-only on the server; a 403 means the signed-in user is not an admin.
  const res = await fetch(`${API_URL}/api/v1/autonomy/${action}`, { method: 'POST', headers: await authHeaders() });
  if (!res.ok) throw new Error(`Autonomy ${action} failed (${res.status})`);
  return res.json() as Promise<AutonomyStatus>;
}
```
Check that `pipeline.getSnapshot()` matches the `AutonomyStatus` shape, and make callers handle the thrown errors (the stubs never threw).

### 2.3 Trade history shows exit price = entry price — `backend-api.ts` (lines 126–136, 140)
`entryPrice: t.price, exitPrice: t.price` and `cash: 10000` are placeholders. The `trades` table stores one price per row,
so the fix is a data-model change: store entry and exit price (or join the trade to its position) and read the real balance.

### 2.4 Provider API keys ship in the browser — `src/lib/providers/forex.ts:8`, `.env.example`
Anything with a `VITE_` prefix is public. `VITE_TWELVEDATA_API_KEY` and `VITE_MASSIVE_API_KEY` can be copied by any visitor.
Move those calls behind a Supabase Edge Function or the Fastify API and keep the key server-side. (Kraken's public data needs no key.)

### 2.5 Twelve Data stream never reconnects — `forex.ts:115`

```ts
// Reconnect with exponential backoff, like the Binance provider does.
let backoff = 1000;
let timer: ReturnType<typeof setTimeout> | null = null;

ws.onopen = () => {
  backoff = 1000; // reset after a successful connection
  onStatus?.('open');
  ws?.send(JSON.stringify({ action: 'subscribe', params: { symbols: formattedSymbol } }));
};
ws.onclose = () => {
  if (closed) return;
  onStatus?.('reconnecting', `closed, retry in ${Math.round(backoff / 1000)}s`);
  timer = setTimeout(() => { backoff = Math.min(backoff * 2, 30000); connect(); }, backoff);
};
// In the unsubscribe function, also: if (timer) clearTimeout(timer);
```

### 2.6 No rate limiting on the API

```ts
// npm i @fastify/rate-limit
import rateLimit from '@fastify/rate-limit';

// Register before the routes: 60 requests per minute per client IP.
// Use a tighter limit on /analyze, because each call runs the whole engine stack.
void app.register(rateLimit, { max: 60, timeWindow: '1 minute' });
```
Fastify's default body limit is 1 MiB, which already caps request size; the validation in 1.2 caps candle count.

### 2.7 Smaller items
- `marketType: 'crypto'` is hardcoded in `decisionService.ts` (lines 52, 60), `useAutonomousTrading.ts:146` and the portfolio defaults. Derive it from `getMarket(symbol)`.
- `src/lib/binance.ts` and `src/lib/providers/binance.ts` are near-identical copies. Keep one.
- `useAutonomousTrading.ts` imports Binance directly instead of `getDataProvider`, so it is crypto-only.
- Decision logic exists twice (Supabase edge function `decision-analyze` and Fastify `/api/v1/decisions/analyze`). Pick one source of truth.
- Two server entry points: `api:dev` runs `backend/src/index.ts` and `backend:dev` runs `server.ts`. I have **not opened `index.ts`**; check whether it is a second Express server and retire whichever you don't use.
- Four migrations dated `20261001…` repeat earlier ones. Three (`prevent_profile_role_escalation`, `ml_rate_limits`, `paper_sim_account_versions`) are the original SQL plus a header comment, so they just run twice; they are only safe if each statement is idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`).
  **Do not delete the `paper_sim_accounts` copy:** it also adds `SECURITY DEFINER` and `SET search_path = public` to `touch_paper_sim_account_updated_at()`, which is a real hardening change. Check how each pair behaves on a fresh database and on one where the originals are already applied before removing anything.

---

## 3. USD pairs instead of USDT ❓

**Needs your decision: Kraken or Coinbase.** My recommendation is Kraken.

| | Kraken | Coinbase Exchange |
| --- | --- | --- |
| API key for market data | none | none |
| Intervals | 1, 5, 15, 30, 60, 240, 1440, 10080 min | 1m, 5m, 15m, 1h, 6h, 1d |
| Max candles per call | 720 | 300 |
| Missing from your timeframe list | 3m, 1M | 3m, 30m, 4h, 1w, 1M |

Missing timeframes can be built by aggregating smaller candles (3m from 1m, 1M from 1d).

### Steps
1. **Provider.** Add `src/lib/providers/kraken.ts` implementing `DataProvider` (REST klines + WebSocket that reports the `closed` flag and reconnects). Register it for `case 'crypto'` in `providers/index.ts` and add a `kraken` entry to `TIMEFRAME_MAP`.
2. **Markets.** Rewrite the 19 crypto entries in `src/lib/markets.ts` and the 7 in `src/lib/types.ts:117-123` (`BTCUSD`, `ETHUSD`, …, `quoteAsset: 'USD'`, `exchange: 'Kraken'`, `provider: 'kraken'`).
3. **Server-side Binance calls.** Move these onto the new provider: `backend/src/routes/market.ts`, `backend/src/autonomy/pipeline.ts`, `backend/src/services/index.ts:152`, `src/api/markets.ts`, `supabase/functions/ml-predict/index.ts:27`.
4. **Hardcoded `BTCUSDT`.** `Dashboard.tsx:44`, `AlertsPage.tsx:11`, `useAutonomousTrading.ts:59`, `AutonomousCommandCenter.tsx:57` (`.replace('USDT','')` becomes `.replace(/USD$/, '')`), `server.ts:26`, `pipeline.ts:8`, `decisions.ts` (run route default), `mlController.ts:8,19`, `marketController.ts:7`, `ml-predict/index.ts:319`.
5. **Existing data.** Cached ML predictions, paper positions and trades are keyed by the old symbols. Decide whether to clear or migrate them; models retrain per symbol.

### Provider outline (untested — check Kraken's docs before relying on it)

```ts
// providers/kraken.ts — outline only
const REST = 'https://api.kraken.com/0/public';

// App symbol -> Kraken pair. Kraken calls bitcoin "XBT"; other coins are just base + USD.
const toPair = (symbol: string) => symbol.replace(/^BTC/, 'XBT'); // BTCUSD -> XBTUSD

// App timeframe -> Kraken interval in minutes. 3m and 1M are not offered.
const INTERVAL: Record<string, number> = {
  '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440, '1w': 10080,
};

// GET `${REST}/OHLC?pair=${toPair(symbol)}&interval=${INTERVAL[timeframe]}`
// Rows are [time, open, high, low, close, vwap, volume, count]; ask for at most 720.
// The newest row is the still-forming candle (per Kraken's docs), so keep the closed-candle rule from section 1.1.
```

**Pair coverage:** a few of your 19 (BNB, and MATIC, now POL) may not exist as USD pairs on Kraken. Check each against its pair list before switching.

---

## 4. Verify before you push

```bash
npm run typecheck           # frontend types
npm run backend:typecheck   # backend types
npm run lint
npm test
```

Manual check for the signal fix: open a 1m chart and watch the recommendation. It should change only when a minute closes, never in the middle of one.

---

## 5. What changed in behaviour (read before deploying)
- Backend errors are now `400` (bad input) or `500` (unexpected) with fixed messages.
- Production requires `CORS_ORIGIN`; browsers on other origins are blocked.
- Autonomous scheduler is off unless `AUTONOMOUS_TRADING=true`.
- Dashboard and hook signals lag the live price by up to one candle (by design).
