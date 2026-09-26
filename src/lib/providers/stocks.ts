import type { Candle, Timeframe } from '../types';
import type { DataProvider } from './types';
import { fetchWithTimeout } from './request';

const REST = 'https://api.massive.com';

const API_KEY = import.meta.env.VITE_MASSIVE_API_KEY as string | undefined;

const TIMEFRAME_MAP: Record<Timeframe, {
  multiplier: number;
  timespan: 'minute' | 'hour' | 'day' | 'week' | 'month';
}> = {
  '1m': {
    multiplier: 1,
    timespan: 'minute',
  },
  '3m': {
    multiplier: 3,
    timespan: 'minute',
  },
  '5m': {
    multiplier: 5,
    timespan: 'minute',
  },
  '15m': {
    multiplier: 15,
    timespan: 'minute',
  },
  '30m': {
    multiplier: 30,
    timespan: 'minute',
  },
  '1h': {
    multiplier: 1,
    timespan: 'hour',
  },
  '4h': {
    multiplier: 4,
    timespan: 'hour',
  },
  '1d': {
    multiplier: 1,
    timespan: 'day',
  },
  '1w': {
    multiplier: 1,
    timespan: 'week',
  },
  '1M': {
    multiplier: 1,
    timespan: 'month',
  },
};

const POLL_INTERVALS: Partial<Record<Timeframe, number>> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
  '1w': 86_400_000,
  '1M': 86_400_000,
};

export const stocksProvider: DataProvider = {
  name: 'massive',

  supportsMarket(marketType: string): boolean {
    return (
      marketType === 'stock' ||
      marketType === 'index'
    );
  },

  async fetchKlines(
    symbol: string,
    timeframe: Timeframe,
    limit = 200,
  ): Promise<Candle[]> {
    if (!API_KEY) {
      throw new Error(
        'MASSIVE_API_KEY is not configured.',
      );
    }

    const mapping = TIMEFRAME_MAP[timeframe];

    if (!mapping) {
      throw new Error(
        `Unsupported timeframe: ${timeframe}`,
      );
    }

    const safeLimit = Math.min(
      Math.max(limit, 1),
      50000,
    );

    /*
     * Massive aggregate endpoints require a date/time
     * range rather than simply "limit".
     *
     * We calculate a sufficiently large historical
     * window based on the requested timeframe.
     */
    const now = new Date();

    const estimatedMinutesPerCandle =
      mapping.timespan === 'minute'
        ? mapping.multiplier
        : mapping.timespan === 'hour'
          ? mapping.multiplier * 60
          : mapping.timespan === 'day'
            ? mapping.multiplier * 1440
            : mapping.timespan === 'week'
              ? mapping.multiplier * 10080
              : mapping.multiplier * 43200;

    const totalMinutes =
      safeLimit *
      estimatedMinutesPerCandle *
      1.5;

    const from = new Date(
      now.getTime() -
        totalMinutes * 60 * 1000,
    );

    const fromDate = formatDate(from);
    const toDate = formatDate(now);

    const url =
      `${REST}/v2/aggs/ticker/${encodeURIComponent(symbol)}` +
      `/range/${mapping.multiplier}/${mapping.timespan}` +
      `/${fromDate}/${toDate}` +
      `?adjusted=true&sort=asc&limit=${safeLimit}` +
      `&apiKey=${encodeURIComponent(API_KEY)}`;

    const response = await fetchWithTimeout(url);

    const body = await response.text();

    if (!response.ok) {
      throw new Error(
        `Massive API request failed (${response.status}): ${body}`,
      );
    }

    const json = JSON.parse(body) as {
      status?: string;
      error?: string;
      message?: string;
      results?: Array<{
        o: number;
        h: number;
        l: number;
        c: number;
        v?: number;
        t: number;
      }>;
    };

    if (json.status === 'ERROR') {
      throw new Error(
        `Massive API error: ${
          json.error ??
          json.message ??
          'Unknown API error'
        }`,
      );
    }

    if (!Array.isArray(json.results)) {
      return [];
    }

    return json.results
      .map((bar) => ({
        time: Math.floor(bar.t / 1000),
        open: Number(bar.o),
        high: Number(bar.h),
        low: Number(bar.l),
        close: Number(bar.c),
        volume: Number(bar.v ?? 0),
      }))
      .filter(
        (candle) =>
          Number.isFinite(candle.time) &&
          Number.isFinite(candle.open) &&
          Number.isFinite(candle.high) &&
          Number.isFinite(candle.low) &&
          Number.isFinite(candle.close),
      );
  },

  subscribeKlines(
    symbol: string,
    timeframe: Timeframe,
    onCandle: (
      candle: Candle,
      closed: boolean,
    ) => void,
    onStatus?: (
      status:
        | 'connecting'
        | 'open'
        | 'closed'
        | 'reconnecting',
      detail?: string,
    ) => void,
  ): () => void {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let previousCandleTime: number | null = null;

    const interval =
      POLL_INTERVALS[timeframe] ??
      60_000;

    const poll = async (): Promise<void> => {
      if (stopped) {
        return;
      }

      onStatus?.('connecting');

      try {
        const candles =
          await stocksProvider.fetchKlines(
            symbol,
            timeframe,
            200,
          );

        if (stopped) {
          return;
        }

        if (candles.length === 0) {
          throw new Error(
            `No market data returned for ${symbol}`,
          );
        }

        onStatus?.(
          'open',
          `Massive data received for ${symbol}`,
        );

        const latest =
          candles[candles.length - 1];

        const isNewCandle =
          previousCandleTime !== null &&
          latest.time !== previousCandleTime;

        onCandle(
          latest,
          isNewCandle,
        );

        previousCandleTime = latest.time;
      } catch (error) {
        if (!stopped) {
          onStatus?.(
            'reconnecting',
            error instanceof Error
              ? error.message
              : 'Massive API polling failed',
          );
        }
      }

      if (!stopped) {
        timer = setTimeout(
          poll,
          interval,
        );
      }
    };

    onStatus?.(
      'connecting',
      `Polling Massive every ${Math.round(
        interval / 1000,
      )}s`,
    );

    void poll();

    return () => {
      stopped = true;

      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }

      onStatus?.('closed');
    };
  },
};

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
