import { describe, expect, it } from 'vitest';
import { candleIndex, candleSeconds, isClosed, nextBoundary } from './candle-math';

describe('shared candle math', () => {
  it('uses calendar months for duration, indexing, close, and next boundary', () => {
    const february = Date.parse('2024-02-01T00:00:00Z') / 1000;
    const februaryCandle = { time: february, open: 1, high: 1, low: 1, close: 1, volume: 0 };
    expect(candleSeconds('1M', february)).toBe(29 * 86_400);
    expect(candleIndex('1M', february)).toBe(2024 * 12 + 1);
    expect(isClosed(februaryCandle, '1M', Date.parse('2024-03-01T00:00:00Z'))).toBe(true);
    expect(nextBoundary(Date.parse('2024-02-10T00:00:00Z'), '1M')).toBe(Date.parse('2024-03-01T00:00:00Z'));
  });

  it('requires the close grace interval before considering a candle closed', () => {
    const candle = { time: 1_700_000_000, open: 1, high: 1, low: 1, close: 1, volume: 0 };
    const closeAt = (candle.time + 900) * 1000;
    expect(isClosed(candle, '15m', closeAt + 6_999, 7_000)).toBe(false);
    expect(isClosed(candle, '15m', closeAt + 7_000, 7_000)).toBe(true);
  });
});
