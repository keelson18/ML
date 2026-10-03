import type { Candle, MarketDataProvider, Timeframe } from '../types';
import { fetchCanonicalMarketData, type MarketDataResponse } from '../backend-api';
import type { DataProvider } from './types';

const POLL_INTERVALS: Record<MarketDataProvider, number> = {
  binance: 15_000,
  massive: 30_000,
  twelvedata: 30_000,
};

export function createDataProvider(provider: MarketDataProvider | null): DataProvider {
  return {
    name: provider ?? 'unconfigured',
    provider,

    async fetchSeries(symbol: string, timeframe: Timeframe, limit = 1000): Promise<MarketDataResponse> {
      const series = await fetchCanonicalMarketData(symbol, timeframe, limit);
      if (series.instrument.provider !== provider) throw new Error(`The configured source for ${symbol} changed during the request.`);
      return series;
    },

    async fetchKlines(symbol: string, timeframe: Timeframe, limit = 1000): Promise<Candle[]> {
      return (await this.fetchSeries(symbol, timeframe, limit)).candles;
    },

    subscribeKlines(symbol, timeframe, onCandle, onStatus) {
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let lastSeenTime: number | undefined;
      const interval = provider ? POLL_INTERVALS[provider] : 30_000;

      const poll = async () => {
        if (stopped) return;
        onStatus?.('connecting');
        try {
          const series = await this.fetchSeries(symbol, timeframe, 5);
          const latest = series.candles.at(-1);
          if (!latest) throw new Error(`No market data returned for ${symbol}.`);
          if (lastSeenTime === undefined) {
            onCandle(latest, false);
          } else if (latest.time > lastSeenTime) {
            for (const candle of series.candles) {
              if (candle.time > lastSeenTime && candle.time < latest.time) onCandle(candle, true);
            }
            onCandle(latest, false);
          } else {
            onCandle(latest, false);
          }
          lastSeenTime = latest.time;
          onStatus?.('polling', `${series.dataset.provider} data via backend polling`);
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
