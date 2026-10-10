import { describe, expect, it, vi } from 'vitest';
import {
  applyCandleUpdate,
  createOverlayState,
  planCandleUpdate,
  planOverlays,
  syncOverlays,
  type ChartLike,
  type LineOptions,
  type LinePoint,
} from './chart-feed';
import type { Candle, Overlay } from './types';

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

describe('overlay planning and sync', () => {
  const candles = series(3);
  const overlays: Overlay[] = [
    { type: 'line', id: 'ema', color: '#111', points: [{ time: candles[0].time, value: 1 }, { time: candles[2].time, value: 2 }] },
    { type: 'hline', id: 'support', price: 90, label: 'S', color: '#222' },
    { type: 'markers', id: 'signals', markers: [{ time: candles[2].time, position: 'aboveBar', color: 'red', shape: 'arrowDown', text: 'x' }] },
  ];

  function fakeChart() {
    const created: Array<{ id: number; options: LineOptions; data: LinePoint[] }> = [];
    const removed: number[] = [];
    let nextId = 0;
    const chart: ChartLike<number> = {
      addLine: (options) => { nextId += 1; created.push({ id: nextId, options, data: [] }); return nextId; },
      setLineData: (id, points) => { const entry = created.find((item) => item.id === id); if (entry) entry.data = points; },
      removeSeries: (id) => { removed.push(id); },
    };
    return { chart, created, removed };
  }

  it('plans lines with stable keys and markers sorted by time', () => {
    const plan = planOverlays(overlays, candles);
    expect(plan.lines.map((line) => line.key)).toEqual(['0:line:ema', '1:hline:support']);
    expect(plan.lines[1].points).toEqual([{ time: candles[0].time, value: 90 }, { time: candles[2].time, value: 90 }]);
    expect(plan.markers).toHaveLength(1);
  });

  it('creates series once, updates data in place and removes only stale keys', () => {
    const state = createOverlayState<number>();
    const { chart, created, removed } = fakeChart();
    const setMarkers = vi.fn();

    syncOverlays(chart, state, planOverlays(overlays, candles), setMarkers);
    expect(created).toHaveLength(2);
    expect(setMarkers).toHaveBeenCalledTimes(1);

    syncOverlays(chart, state, planOverlays(overlays, candles), setMarkers);
    expect(created).toHaveLength(2);
    expect(removed).toEqual([]);
    expect(setMarkers).toHaveBeenCalledTimes(1);

    const withoutSupport = overlays.filter((overlay) => overlay.id !== 'support');
    syncOverlays(chart, state, planOverlays(withoutSupport, candles), setMarkers);
    expect(removed).toEqual([2]);
    expect(created).toHaveLength(2);
  });

  it('updates data in place when only points change', () => {
    const state = createOverlayState<number>();
    const { chart, created } = fakeChart();
    const setMarkers = vi.fn();
    syncOverlays(chart, state, planOverlays(overlays, candles), setMarkers);
    const changed = [{ ...overlays[0], points: [{ time: candles[0].time, value: 7 }] }, ...overlays.slice(1)];
    syncOverlays(chart, state, planOverlays(changed, candles), setMarkers);
    expect(created).toHaveLength(2);
    expect(created[0].data).toEqual([{ time: candles[0].time, value: 7 }]);
  });
});
