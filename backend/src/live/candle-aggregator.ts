import type { Timeframe } from '../../../src/lib/types';
import type { FormingCandle, Tick } from './types';

const FIXED_TIMEFRAME_SECONDS: Partial<Record<Timeframe, number>> = {
  '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14_400, '1d': 86_400,
};

export function isAggregatableTimeframe(timeframe: Timeframe): boolean {
  return FIXED_TIMEFRAME_SECONDS[timeframe] !== undefined;
}

export class CandleAggregator {
  private readonly forming = new Map<string, { symbol: string; timeframe: Timeframe; candle: FormingCandle }>();

  constructor(private readonly timeframes: readonly Timeframe[]) {
    for (const timeframe of timeframes) {
      if (!isAggregatableTimeframe(timeframe)) throw new Error(`Timeframe ${timeframe} cannot be aggregated from ticks.`);
    }
  }

  applyTick(tick: Tick): void {
    const timestampSeconds = tick.timestamp / 1000;
    const volume = tick.volume ?? 0;
    for (const timeframe of this.timeframes) {
      const seconds = FIXED_TIMEFRAME_SECONDS[timeframe] as number;
      const bucket = Math.floor(timestampSeconds / seconds) * seconds;
      const key = `${tick.symbol}|${timeframe}`;
      const current = this.forming.get(key);
      if (current && bucket < current.candle.time) continue;
      if (!current || bucket > current.candle.time) {
        this.forming.set(key, {
          symbol: tick.symbol,
          timeframe,
          candle: { time: bucket, open: tick.price, high: tick.price, low: tick.price, close: tick.price, volume, forming: true },
        });
        continue;
      }
      const { candle } = current;
      this.forming.set(key, {
        ...current,
        candle: {
          ...candle,
          high: Math.max(candle.high, tick.price),
          low: Math.min(candle.low, tick.price),
          close: tick.price,
          volume: candle.volume + volume,
        },
      });
    }
  }

  formingCandle(symbol: string, timeframe: Timeframe): FormingCandle | undefined {
    const entry = this.forming.get(`${symbol}|${timeframe}`);
    return entry ? { ...entry.candle } : undefined;
  }

  // A closed REST candle at or after the forming bucket supersedes it.
  applyClosedCandle(symbol: string, timeframe: Timeframe, closedTime: number): void {
    const key = `${symbol}|${timeframe}`;
    const entry = this.forming.get(key);
    if (entry && entry.candle.time <= closedTime) this.forming.delete(key);
  }
}
