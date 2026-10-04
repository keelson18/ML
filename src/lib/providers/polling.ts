import type { Candle } from '../types';

// Returns candles that were open at the previous poll and are now complete.
export function getNewlyClosedCandles(candles: Candle[], lastSeenTime: number | undefined): Candle[] {
  const latestTime = candles.at(-1)?.time;
  if (lastSeenTime === undefined || latestTime === undefined || latestTime <= lastSeenTime) return [];
  return candles.filter((candle) => candle.time >= lastSeenTime && candle.time < latestTime);
}
