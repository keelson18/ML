import { config, autonomySymbols } from '../backend/src/config';
import { fetchMarketData, MarketDataProviderError } from '../backend/src/services/marketDataService';
import { getMarket } from '../src/lib/markets';
import type { Timeframe } from '../src/lib/types';
import { selectClosedCandles, candleSeconds } from '../backend/src/trader/candle-math';
import { traderConfig } from '../backend/src/trader/config';
import { hasFreshClosedCandleData } from '../backend/src/trader/market-data-quality';
import { providerRequestSpacingMs } from '../backend/src/autonomy/paper-autopilot';

function providerSpacingMs(provider: string): number {
  if (provider === 'massive') return providerRequestSpacingMs();
  return Math.max(config.marketProbeIntervalMs, Math.ceil(config.twelveDataBudgetWindowMs / config.twelveDataRequestsPerWindow));
}

const timeframes = [...new Set([
  ...traderConfig.HTF_TIMEFRAMES,
  traderConfig.SETUP_TIMEFRAME,
  ...traderConfig.TRIGGER_TIMEFRAMES,
  traderConfig.MGMT_TIMEFRAME,
])] as Timeframe[];
const minimumClosedCandles = 50;
let failed = false;

for (const symbol of autonomySymbols) {
  const market = getMarket(symbol);
  if (!market || market.marketType !== 'crypto') {
    console.log(JSON.stringify({ symbol, status: 'blocked', reason: 'configured-symbol-is-not-crypto' }));
    failed = true;
    continue;
  }
  const keyConfigured = market.provider === 'massive'
    ? Boolean(config.massiveApiKey)
    : market.provider === 'twelvedata' ? Boolean(config.twelveDataApiKey) : false;
  if (!keyConfigured) {
    for (const timeframe of timeframes) {
      console.log(JSON.stringify({ symbol, provider: market.provider, timeframe, status: 'blocked', reason: 'provider-key-not-configured' }));
    }
    failed = true;
    continue;
  }

  for (const timeframe of timeframes) {
    const checkedAt = new Date().toISOString();
    try {
      // Twelve Data may include the still-forming candle in outputsize; ask for headroom.
      const series = await fetchMarketData(symbol, timeframe, minimumClosedCandles + 10);
      const closed = selectClosedCandles(series.candles, timeframe);
      const latestClosed = closed.at(-1);
      const ageMs = latestClosed
        ? Math.max(0, Date.now() - (latestClosed.time + candleSeconds(timeframe, latestClosed.time)) * 1000)
        : null;
      const stale = series.stale || !hasFreshClosedCandleData(series.candles, timeframe);
      const verified = !stale && closed.length >= minimumClosedCandles;
      console.log(JSON.stringify({
        symbol, provider: series.dataset.provider, timeframe, status: verified ? 'available' : 'unverified',
        sourceInstrument: series.dataset.sourceInstrument, quoteCurrency: series.dataset.quoteCurrency,
        candleCount: series.candles.length, closedCandleCount: closed.length,
        minimumClosedCandles,
        latestClosedCandleAt: latestClosed ? new Date(latestClosed.time * 1000).toISOString() : null,
        ageMs, stale, checkedAt,
      }));
      if (!verified) failed = true;
    } catch (error) {
      const providerStatus = error instanceof MarketDataProviderError ? error.status : undefined;
      const message = error instanceof Error ? error.message : '';
      const errorCategory = providerStatus === 429 ? 'rate-limited'
        : /returned no candles/i.test(message) ? 'empty-candle-series'
          : /mismatched instrument metadata/i.test(message) ? 'instrument-mismatch'
            : /market data failed/i.test(message) ? 'provider-declared-error'
              : /empty or invalid response/i.test(message) ? 'invalid-provider-payload'
                : 'transport-or-validation-error';
      console.log(JSON.stringify({
        symbol, provider: market.provider, timeframe,
        status: providerStatus === 404 ? 'unavailable' : providerStatus === 429 ? 'rate-limited' : 'unverified',
        providerStatus, errorCategory, checkedAt,
      }));
      failed = true;
    }
    if (symbol !== autonomySymbols.at(-1) || timeframe !== timeframes.at(-1)) {
      await new Promise((resolve) => setTimeout(resolve, providerSpacingMs(market.provider)));
    }
  }
}

if (failed) process.exitCode = 1;
