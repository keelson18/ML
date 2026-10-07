// Checks UTC scheduling, close grace, complete-candle filtering, and calendar boundaries.
import { describe, expect, it } from 'vitest';
import { candleDurationMs, isCandleComplete, nextCandleBoundary, nextScheduledRunAt, selectClosedCandles } from './candle-clock';

describe('UTC candle clock', () => {
  it('computes the next aligned boundary and catches the current close grace window', () => {
    const now = Date.parse('2026-10-07T10:07:00Z');
    expect(nextCandleBoundary(now, '15m')).toBe(Date.parse('2026-10-07T10:15:00Z'));
    expect(nextScheduledRunAt(Date.parse('2026-10-07T10:15:03Z'), '15m', 7_000)).toBe(Date.parse('2026-10-07T10:15:07Z'));
  });

  it('rejects an incomplete candle until its close grace has elapsed', () => {
    const candle = { time: Date.parse('2026-10-07T10:00:00Z') / 1000, open: 1, high: 2, low: 1, close: 2, volume: 1 };
    expect(isCandleComplete(candle, '15m', Date.parse('2026-10-07T10:15:06Z'), 7_000)).toBe(false);
    expect(isCandleComplete(candle, '15m', Date.parse('2026-10-07T10:15:07Z'), 7_000)).toBe(true);
    expect(selectClosedCandles([candle], '15m', Date.parse('2026-10-07T10:15:06Z'), 7_000)).toHaveLength(0);
  });

  it('aligns weekly boundaries to UTC Monday and handles variable month lengths', () => {
    expect(nextCandleBoundary(Date.parse('2026-10-07T12:00:00Z'), '1w')).toBe(Date.parse('2026-10-12T00:00:00Z'));
    expect(candleDurationMs('1M', Date.parse('2026-02-01T00:00:00Z'))).toBe(28 * 86_400_000);
    expect(nextCandleBoundary(Date.parse('2026-02-10T00:00:00Z'), '1M')).toBe(Date.parse('2026-03-01T00:00:00Z'));
  });
});
