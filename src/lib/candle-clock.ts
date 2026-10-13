import type { Candle, Timeframe } from './types';

const intervals: Partial<Record<Timeframe, number>> = {
  '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1_800,
  '1h': 3_600, '4h': 14_400, '1d': 86_400, '1w': 604_800,
};

export function candleSeconds(timeframe: Timeframe, startSeconds = Date.now() / 1000): number {
  if (timeframe !== '1M') return intervals[timeframe]!;
  const start = new Date(startSeconds * 1000);
  return (Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1) - Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)) / 1000;
}

export function candleIndex(timeframe: Timeframe, timeSeconds: number): number {
  if (timeframe === '1w') return Math.floor((timeSeconds + 3 * 86_400) / 604_800);
  if (timeframe === '1M') {
    const date = new Date(timeSeconds * 1000);
    return date.getUTCFullYear() * 12 + date.getUTCMonth();
  }
  return Math.floor(timeSeconds / candleSeconds(timeframe, timeSeconds));
}

export function nextBoundary(nowMs: number, timeframe: Timeframe): number {
  if (timeframe === '1M') {
    const current = new Date(nowMs);
    return Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1);
  }
  if (timeframe === '1w') {
    const current = new Date(nowMs);
    const daysUntilMonday = (8 - current.getUTCDay()) % 7 || 7;
    return Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + daysUntilMonday);
  }
  const intervalMs = candleSeconds(timeframe) * 1000;
  return (Math.floor(nowMs / intervalMs) + 1) * intervalMs;
}

export function latestClosedCandleTime(nowMs: number, timeframe: Timeframe, graceMs = 0): number {
  const effective = nowMs - graceMs;
  let boundary: number;
  if (timeframe === '1M') {
    const current = new Date(effective);
    boundary = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1);
  } else if (timeframe === '1w') {
    const current = new Date(effective);
    const daysSinceMonday = (current.getUTCDay() + 6) % 7;
    boundary = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() - daysSinceMonday);
  } else {
    const intervalMs = candleSeconds(timeframe) * 1000;
    boundary = Math.floor(effective / intervalMs) * intervalMs;
  }
  const priorStartMs = boundary - candleSeconds(timeframe, (boundary - 1) / 1000) * 1000;
  return priorStartMs / 1000;
}

export function isClosed(candle: Candle, timeframe: Timeframe, nowMs = Date.now(), graceMs = 0): boolean {
  return candle.time * 1000 + candleSeconds(timeframe, candle.time) * 1000 <= nowMs - graceMs;
}

export function selectClosedCandles(candles: Candle[], timeframe: Timeframe, nowMs = Date.now(), graceMs = 0): Candle[] {
  return candles.filter((candle) => isClosed(candle, timeframe, nowMs, graceMs));
}
