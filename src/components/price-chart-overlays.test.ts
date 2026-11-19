import { describe, expect, it } from 'vitest';
import type { Candle } from '../lib/types';
import { movingAverageOverlay, planOverlays, toLineWidth } from './price-chart-overlays';

const colors = { primary: '#3b82f6', success: '#22c55e', danger: '#ef4444' };

describe('price chart overlays', () => {
  it('produces an empty plan without overlays', () => {
    expect(planOverlays(undefined, colors)).toEqual({ lines: [], markers: [], priceLines: [] });
    expect(planOverlays([], colors)).toEqual({ lines: [], markers: [], priceLines: [] });
  });

  it('plans line, marker, and price-line overlays with theme colors', () => {
    const plan = planOverlays([
      {
        type: 'line',
        data: [
          { time: 100, value: 10 },
          { time: Number.NaN, value: 20 },
        ],
        width: 7,
      },
      {
        type: 'markers',
        data: [{ time: 100, position: 'aboveBar', shape: 'arrowUp', text: 'entry' }],
      },
      { type: 'priceLines', data: [{ price: 12, title: 'stop' }] },
    ], colors);

    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0]).toMatchObject({ color: colors.primary, width: 4 });
    expect(plan.lines[0]!.data).toEqual([{ time: 100, value: 10 }]);
    expect(plan.markers).toEqual([{
      time: 100,
      position: 'aboveBar',
      shape: 'arrowUp',
      color: colors.primary,
      text: 'entry',
    }]);
    expect(plan.priceLines).toEqual([{ price: 12, color: colors.primary, title: 'stop' }]);
  });

  it('clamps overlay widths and ignores non-finite values', () => {
    expect(toLineWidth(undefined)).toBe(2);
    expect(toLineWidth(0)).toBe(1);
    expect(toLineWidth(99)).toBe(4);
    expect(planOverlays([{ type: 'priceLines', data: [{ price: Number.NaN }] }], colors).priceLines).toEqual([]);
  });

  it('builds a moving-average overlay from closed candle closes', () => {
    const candles: Candle[] = [1, 2, 3, 4].map((close, index) => ({
      time: 1_767_225_600 + index * 60,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1,
    }));
    expect(movingAverageOverlay(candles, 2)).toEqual({
      type: 'line',
      data: [
        { time: candles[1]!.time, value: 1.5 },
        { time: candles[2]!.time, value: 2.5 },
        { time: candles[3]!.time, value: 3.5 },
      ],
    });
    expect(movingAverageOverlay(candles, 5)).toBeNull();
  });
});
