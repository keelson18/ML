import type { Candle, MarketDataProvider, Timeframe } from '../types';
import { fetchCanonicalMarketData } from '../backend-api';
import { getNewlyClosedCandles } from './polling';
import { subscribeStreamCandles, supportsStreamTimeframe } from './stream-client';
import type { DataProvider } from './types';

const POLL_INTERVALS: Record<MarketDataProvider, number> = {
  massive: 30_000,
  twelvedata: 30_000,
};

export function shouldEmitLatestCandle(lastSeenTime: number | undefined, latestTime: number | undefined): boolean {
  if (latestTime === undefined) return false;
  return lastSeenTime === undefined || latestTime > lastSeenTime;
}

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
      let streamLive = false;
      const interval = provider ? POLL_INTERVALS[provider] : 30_000;
      const unsubscribeStream = supportsStreamTimeframe(timeframe)
        ? subscribeStreamCandles(symbol, timeframe, (candle) => {
          if (!stopped) onCandle(candle, false);
        }, (mode) => {
          streamLive = mode === 'stream';
          if (!stopped) onStatus?.(streamLive ? 'open' : 'polling', streamLive ? 'live stream' : undefined);
        })
        : () => {};

      const poll = async () => {
        if (stopped) return;
        if (!streamLive) onStatus?.('connecting');
        try {
          const candles = await fetchCanonicalMarketData(symbol, timeframe, 5).then((series) => series.candles);
          if (stopped) return;
          const latest = candles.at(-1);
          if (!latest) throw new Error(`No market data returned for ${symbol}.`);
          // Close the last observed candle and any missed candles before emitting the forming latest candle.
          for (const candle of getNewlyClosedCandles(candles, lastSeenTime)) onCandle(candle, true);
          if (shouldEmitLatestCandle(lastSeenTime, latest.time)) onCandle(latest, false);
          lastSeenTime = latest.time;
          onStatus?.(streamLive ? 'open' : 'polling', `${provider ?? 'market'} data via backend polling`);
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
        unsubscribeStream();
        onStatus?.('closed');
      };
    },
  };
}
