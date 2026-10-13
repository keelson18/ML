import { describe, expect, it } from 'vitest';
import { isClosed, selectClosedCandles } from './candle-clock';
import type { Candle } from './types';

const candle = (time: number): Candle => ({ time, open: 100, high: 101, low: 99, close: 100, volume: 1 });

describe('shared closed-candle selection', () => {
  it('excludes a forming candle even when it is not the last array element', () => {
    const now = Date.UTC(2026, 9, 13, 12, 30);
    const rows = [candle(Date.UTC(2026, 9, 13, 11) / 1000), candle(Date.UTC(2026, 9, 13, 12) / 1000), candle(Date.UTC(2026, 9, 13, 10) / 1000)];
    expect(selectClosedCandles(rows, '1h', now)).toEqual([rows[0], rows[2]]);
  });

  it('applies the close grace period at the boundary', () => {
    const bar = candle(Date.UTC(2026, 9, 13, 11) / 1000);
    const boundary = Date.UTC(2026, 9, 13, 12);
    expect(isClosed(bar, '1h', boundary, 2_000)).toBe(false);
    expect(isClosed(bar, '1h', boundary + 2_000, 2_000)).toBe(true);
  });
});
