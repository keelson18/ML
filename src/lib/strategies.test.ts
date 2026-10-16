import { describe, expect, it } from 'vitest';
import { getStrategy, runStrategy } from './strategies';
import type { Candle } from './types';

function risingCandles(count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index;
    return { time: index * 3600, open: close - 0.25, high: close + 1, low: close - 1, close, volume: 10 };
  });
}

describe('versioned configurable live strategies', () => {
  it('applies RSI mean-reversion parameters to detector behavior', () => {
    const candles = risingCandles(40);
    const defaults = runStrategy(candles, '1h', 'mean-reversion');
    const overridden = runStrategy(candles, '1h', 'mean-reversion', { period: 10, overbought: 101 });

    expect(defaults.some((signal) => signal.side === 'sell')).toBe(true);
    expect(overridden).toEqual([]);
    expect(defaults[0]?.strategyVersion).toBe('1.1.0');
  });

  it('rejects unsupported, malformed, and incompatible configurations', () => {
    const candles = risingCandles(80);
    expect(runStrategy(candles, '1h', 'mean-reversion', { ignored: 5 })).toEqual([]);
    expect(runStrategy(candles, '1h', 'mean-reversion', { period: 10.5 })).toEqual([]);
    expect(runStrategy(candles, '1h', 'mean-reversion', { oversold: 80, overbought: 70 })).toEqual([]);
    expect(runStrategy(candles, '1w', 'mean-reversion')).toEqual([]);
  });

  it('publishes timeframe and parameter contracts for the active library strategies', () => {
    const ids = ['ma-crossover', 'rsi-divergence', 'bollinger-volatility', 'trend-following', 'mean-reversion', 'donchian-breakout', 'support-resistance'];
    for (const id of ids) {
      const strategy = getStrategy(id);
      expect(strategy?.version).toBe('1.1.0');
      expect(strategy?.timeframes.length).toBeGreaterThan(0);
      expect(Object.keys(strategy?.defaultParameters ?? {}).length).toBeGreaterThan(0);
    }
  });
});
