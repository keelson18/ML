// UTC candle boundary and close-completeness helpers shared by scheduler and pipeline.
import type { Candle, Timeframe } from '../../../src/lib/types';

const fixedIntervalsMs: Partial<Record<Timeframe, number>> = {
  '1m': 60_000, '3m': 180_000, '5m': 300_000, '15m': 900_000, '30m': 1_800_000,
  '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000, '1w': 604_800_000,
};

export function candleDurationMs(timeframe: Timeframe, startMs?: number): number {
  if (timeframe !== '1M') return fixedIntervalsMs[timeframe]!;
  if (startMs === undefined) return 2_629_746_000;
  const start = new Date(startMs);
  const next = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
  return next - Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1);
}

export function nextCandleBoundary(nowMs: number, timeframe: Timeframe): number {
  if (timeframe === '1M') {
    const current = new Date(nowMs);
    return Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1);
  }
  if (timeframe === '1w') {
    const current = new Date(nowMs);
    const daysUntilMonday = (8 - current.getUTCDay()) % 7 || 7;
    return Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + daysUntilMonday);
  }
  const interval = candleDurationMs(timeframe);
  return (Math.floor(nowMs / interval) + 1) * interval;
}

export function nextScheduledRunAt(nowMs: number, timeframe: Timeframe, graceMs: number): number {
  let latestBoundary: number;
  if (timeframe === '1M') {
    const current = new Date(nowMs);
    latestBoundary = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1);
  } else {
    latestBoundary = nextCandleBoundary(nowMs, timeframe) - candleDurationMs(timeframe);
  }
  const pendingClose = latestBoundary + graceMs;
  return pendingClose >= nowMs ? pendingClose : nextCandleBoundary(nowMs, timeframe) + graceMs;
}

export function isCandleComplete(candle: Candle, timeframe: Timeframe, nowMs = Date.now(), graceMs = 0): boolean {
  const startMs = candle.time * 1000;
  return startMs + candleDurationMs(timeframe, startMs) <= nowMs - graceMs;
}

export function selectClosedCandles(candles: Candle[], timeframe: Timeframe, nowMs = Date.now(), graceMs = 0): Candle[] {
  return candles.filter((candle) => isCandleComplete(candle, timeframe, nowMs, graceMs));
}
