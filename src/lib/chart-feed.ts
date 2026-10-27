import type { Candle } from './types';

export interface CandleBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type CandleUpdatePlan = { kind: 'none' } | { kind: 'update'; bars: Candle[] } | { kind: 'replace' };

export interface CandleSeriesLike<T> {
  setData(bars: T[]): void;
  update(bar: T): void;
}

function sameCandle(a: Candle, b: Candle): boolean {
  return a.time === b.time && a.open === b.open && a.high === b.high && a.low === b.low && a.close === b.close;
}

export function planCandleUpdate(previous: readonly Candle[], next: readonly Candle[]): CandleUpdatePlan {
  if (previous.length === 0 || next.length === 0) {
    return previous.length === next.length ? { kind: 'none' } : { kind: 'replace' };
  }
  if (next.length < previous.length) return { kind: 'replace' };
  const lastIndex = previous.length - 1;
  for (let index = 0; index < lastIndex; index += 1) {
    if (!sameCandle(previous[index], next[index])) return { kind: 'replace' };
  }
  if (previous[lastIndex].time !== next[lastIndex].time) return { kind: 'replace' };
  const bars = next.slice(lastIndex);
  if (bars.length === 1 && sameCandle(previous[lastIndex], next[lastIndex])) return { kind: 'none' };
  return { kind: 'update', bars };
}

export function applyCandleUpdate<T>(
  series: CandleSeriesLike<T>,
  toBar: (candle: Candle) => T,
  previous: readonly Candle[],
  next: readonly Candle[],
): void {
  const plan = planCandleUpdate(previous, next);
  if (plan.kind === 'none') return;
  if (plan.kind === 'replace') {
    series.setData(next.map(toBar));
    return;
  }
  for (const bar of plan.bars) series.update(toBar(bar));
}
