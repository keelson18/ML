// UTC candle boundary and close-completeness helpers shared by scheduler and pipeline.
import type { Candle, Timeframe } from '../../../src/lib/types';
import { candleSeconds, isClosed, nextBoundary, selectClosedCandles as selectCompleteCandles } from '../trader/candle-math';

export function candleDurationMs(timeframe: Timeframe, startMs = Date.now()): number {
  return candleSeconds(timeframe, startMs / 1000) * 1000;
}

export function nextCandleBoundary(nowMs: number, timeframe: Timeframe): number {
  return nextBoundary(nowMs, timeframe);
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
  return isClosed(candle, timeframe, nowMs, graceMs);
}

export function selectClosedCandles(candles: Candle[], timeframe: Timeframe, nowMs = Date.now(), graceMs = 0): Candle[] {
  return selectCompleteCandles(candles, timeframe, nowMs, graceMs);
}
