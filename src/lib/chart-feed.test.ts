import { describe, expect, it, vi } from 'vitest';
import {
  applyCandleUpdate,
  planCandleUpdate,
} from './chart-feed';
import type { Candle } from './types';

const bar = (time: number, close = time): Candle => ({ time, open: close, high: close + 1, low: close - 1, close, volume: 1 } as Candle);
const series = (count: number, start = 1000) => Array.from({ length: count }, (_, index) => bar(start + index * 60));

describe('planCandleUpdate', () => {
  it('returns none for identical content', () => {
    const candles = series(3);
    expect(planCandleUpdate(candles, series(3))).toEqual({ kind: 'none' });
  });

  it('updates only the last bar when it changes in place', () => {
    const previous = series(3);
    const next = [...series(2), bar(previous[2].time, 999)];
    expect(planCandleUpdate(previous, next)).toEqual({ kind: 'update', bars: [next[2]] });
  });

  it('appends a new closed or forming bar without replacing history', () => {
    const previous = series(3);
    const next = [...previous, bar(previous[2].time + 60)];
    const plan = planCandleUpdate(previous, next);
    expect(plan.kind).toBe('update');
    if (plan.kind === 'update') expect(plan.bars.map((item) => item.time)).toEqual([previous[2].time, previous[2].time + 60]);
  });

  it('replaces everything when history changes in the middle', () => {
    const previous = series(4);
    const next = [...previous];
    next[1] = bar(previous[1].time, 5);
    expect(planCandleUpdate(previous, next)).toEqual({ kind: 'replace' });
  });

  it('replaces everything when older history is prepended or the symbol changes', () => {
    const previous = series(3);
    expect(planCandleUpdate(previous, [bar(previous[0].time - 60), ...previous])).toEqual({ kind: 'replace' });
    expect(planCandleUpdate(previous, series(3, 999_999))).toEqual({ kind: 'replace' });
  });

  it('replaces when the data shrinks and treats two empty series as unchanged', () => {
    expect(planCandleUpdate(series(3), series(2))).toEqual({ kind: 'replace' });
    expect(planCandleUpdate([], [])).toEqual({ kind: 'none' });
    expect(planCandleUpdate([], series(1))).toEqual({ kind: 'replace' });
  });
});

describe('applyCandleUpdate', () => {
  const toBar = (candle: Candle) => ({ time: candle.time, value: candle.close });

  it('calls update for live ticks and setData only on replacement', () => {
    const fake = { setData: vi.fn(), update: vi.fn() };
    const previous = series(3);
    applyCandleUpdate(fake, toBar, previous, [...previous.slice(0, 2), bar(previous[2].time, 500)]);
    expect(fake.update).toHaveBeenCalledTimes(1);
    expect(fake.setData).not.toHaveBeenCalled();

    applyCandleUpdate(fake, toBar, previous, series(3, 42));
    expect(fake.setData).toHaveBeenCalledTimes(1);
  });

  it('does nothing for identical content', () => {
    const fake = { setData: vi.fn(), update: vi.fn() };
    applyCandleUpdate(fake, toBar, series(2), series(2));
    expect(fake.setData).not.toHaveBeenCalled();
    expect(fake.update).not.toHaveBeenCalled();
  });
});
