import type { Candle } from './types';
import { atr } from './indicators';

export { runAllStrategies as runStrategies } from './strategies/index';
export { STRATEGY_REGISTRY, getStrategy, getStrategyAvailability, runAllStrategies, runStrategy, selectBestStrategy } from './strategies/index';

export function riskLevels(candles: Candle[], rr = 2): { atr: number; stopLoss: number; takeProfit: number; entry: number } | null {
  if (candles.length < 20) return null;
  const values = atr(candles, 14);
  const index = candles.length - 1;
  const atrValue = values[index] || candles[index].high - candles[index].low;
  const entry = candles[index].close;
  return {
    atr: atrValue,
    entry,
    stopLoss: entry - atrValue * 1.5,
    takeProfit: entry + atrValue * 1.5 * rr,
  };
}
