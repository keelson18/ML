import type { Candle, MarketDataProvider, Timeframe } from '../types';
import { fetchCanonicalMarketData } from '../backend-api';
import { getNewlyClosedCandles } from './polling';
import type { DataProvider } from './types';

const POLL_INTERVALS: Record<MarketDataProvider, number> = {
  binance: 15_000,
  massive: 30_000,
  twelvedata: 30_000,
};

export function createDataProvider(provider: MarketDataProvider | null): DataProvider {
  return {
    name: provider ?? 'unconfigured',
    supportsMarket: () => provider !== null,

    async fetchKlines(symbol: string, timeframe: Timeframe, limit = 1000): Promise<Candle[]> {
      if (!provider) throw new Error(`No market data provider is configured for ${symbol}.`);
      return (await fetchCanonicalMarketData(symbol, timeframe, limit)).candles;
    },

    subscribeKlines(symbol, timeframe, onCandle, onStatus) {
      if (!provider) {
        onStatus?.('closed', `No market data provider is configured for ${symbol}.`);
        return () => {};
      }
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let lastSeenTime: number | undefined;
      const interval = provider ? POLL_INTERVALS[provider] : 30_000;

      const poll = async () => {
        if (stopped) return;
        onStatus?.('connecting');
        try {
          const candles = await fetchCanonicalMarketData(symbol, timeframe, 5).then((series) => series.candles);
          if (stopped) return;
          const latest = candles.at(-1);
          if (!latest) throw new Error(`No market data returned for ${symbol}.`);
          // Close the last observed candle and any missed candles before emitting the forming latest candle.
          for (const candle of getNewlyClosedCandles(candles, lastSeenTime)) onCandle(candle, true);
          onCandle(latest, false);
          lastSeenTime = latest.time;
          onStatus?.('open', `${provider ?? 'market'} data via backend polling`);
        } catch (error) {
          if (!stopped) onStatus?.('reconnecting', error instanceof Error ? error.message : 'Market data polling failed.');
        } finally {
          if (!stopped) timer = setTimeout(() => void poll(), interval);
        }
      };

      onStatus?.('connecting');
      void poll();
      return () => {
        stopped = true;
        if (timer) clearTimeout(timer);
        onStatus?.('closed');
      };
    },
  };
}
