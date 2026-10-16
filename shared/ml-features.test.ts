import { describe, expect, it } from 'vitest';
import { computeMlFeatures, computeRsi, type MlCandle } from './ml-features';

function flatCandles(count: number): MlCandle[] {
  return Array.from({ length: count }, (_, index) => ({
    time: index,
    open: 100,
    high: 100,
    low: 100,
    close: 100,
    volume: 1,
  }));
}

describe('ML feature engineering', () => {
  it('uses neutral RSI when the warmup window has no gains or losses', () => {
    expect(computeRsi(Array(20).fill(100))[14]).toBe(50);
    expect(computeRsi(Array(20).fill(100)).every(Number.isFinite)).toBe(true);
  });

  it('drops labels whose forward move does not exceed the ATR threshold', () => {
    const candles = flatCandles(320).map((candle, index) => {
      const close = 100 + index * 0.001;
      return { ...candle, open: close, close, high: close + 0.01, low: close - 0.01 };
    });
    const permissive = computeMlFeatures(candles, { minimumMoveAtr: 0.1 });
    const strict = computeMlFeatures(candles, { minimumMoveAtr: 5 });

    expect(permissive.features.length).toBeGreaterThan(50);
    expect(permissive.labels).toHaveLength(permissive.features.length);
    expect(strict.features.length).toBeLessThan(permissive.features.length);
    expect(strict.labels).toHaveLength(strict.features.length);
  });

  it('rejects invalid label thresholds', () => {
    expect(() => computeMlFeatures(flatCandles(220), { minimumMoveAtr: Number.NaN })).toThrow('Minimum ATR move');
  });
});
