import type { Candle, Timeframe } from '../../../src/lib/types';
import { config } from '../config';
import { candleSeconds, selectClosedCandles } from './candle-math';
import { traderConfig } from './config';

export function hasFreshClosedCandleData(
  candles: Candle[],
  timeframe: Timeframe,
  now = Date.now(),
  maximumAgeTtlMultiplier = config.marketDataMaxStaleTtlMultiplier,
): boolean {
  const latestClosed = selectClosedCandles(candles, timeframe, now, traderConfig.CLOSE_GRACE_MS).at(-1);
  if (!latestClosed) return false;
  const durationMs = candleSeconds(timeframe, latestClosed.time) * 1000;
  const candleAgeMs = now - (latestClosed.time * 1000 + durationMs);
  return candleAgeMs <= durationMs * maximumAgeTtlMultiplier;
}
