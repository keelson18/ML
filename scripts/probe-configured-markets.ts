import { config, autonomySymbols } from '../backend/src/config';
import { fetchMarketData, MarketDataProviderError } from '../backend/src/services/marketDataService';
import { getMarket } from '../src/lib/markets';
import { selectClosedCandles, candleSeconds } from '../backend/src/trader/candle-math';
import { traderConfig } from '../backend/src/trader/config';

const timeframes = [...new Set([
  ...traderConfig.HTF_TIMEFRAMES,
  traderConfig.SETUP_TIMEFRAME,
  ...traderConfig.TRIGGER_TIMEFRAMES,
  traderConfig.MGMT_TIMEFRAME,
])];
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
      const series = await fetchMarketData(symbol, timeframe, 5);
      const closed = selectClosedCandles(series.candles, timeframe);
      const latestClosed = closed.at(-1);
      const ageMs = latestClosed
        ? Math.max(0, Date.now() - (latestClosed.time + candleSeconds(timeframe, latestClosed.time)) * 1000)
        : null;
      const stale = series.stale || latestClosed === undefined
        || (ageMs !== null && ageMs > candleSeconds(timeframe, latestClosed.time) * config.adminCandleStaleMultiplier * 1000);
      console.log(JSON.stringify({
        symbol, provider: series.dataset.provider, timeframe, status: series.candles.length ? 'available' : 'unverified',
        sourceInstrument: series.dataset.sourceInstrument, quoteCurrency: series.dataset.quoteCurrency,
        candleCount: series.candles.length, closedCandleCount: closed.length,
        latestClosedCandleAt: latestClosed ? new Date(latestClosed.time * 1000).toISOString() : null,
        ageMs, stale, checkedAt,
      }));
      if (!series.candles.length || stale) failed = true;
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
      await new Promise((resolve) => setTimeout(resolve, config.marketProbeIntervalMs));
    }
  }
}

if (failed) process.exitCode = 1;
