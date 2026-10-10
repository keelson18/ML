import type { Candle, Overlay } from './types';

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

export interface LinePoint {
  time: number;
  value: number;
}

export interface LineOptions {
  color: string;
  lineWidth: 1;
  priceLineVisible: boolean;
  lastValueVisible: boolean;
  lineStyle?: number;
  title?: string;
}

export interface LineSpec {
  key: string;
  options: LineOptions;
  points: LinePoint[];
}

export interface MarkerSpec {
  time: number;
  position: 'aboveBar' | 'belowBar' | 'inBar';
  color: string;
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
  text?: string;
}

export interface OverlayPlan {
  lines: LineSpec[];
  markers: MarkerSpec[];
}

export interface ChartLike<S> {
  addLine(options: LineOptions): S;
  setLineData(series: S, points: LinePoint[]): void;
  removeSeries(series: S): void;
}

export interface OverlayState<S> {
  lines: Map<string, { series: S; optionsKey: string; dataKey: string }>;
  markersKey: string;
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

export function planOverlays(overlays: Overlay[], candles: Candle[]): OverlayPlan {
  const lines: LineSpec[] = [];
  const markers: MarkerSpec[] = [];
  overlays.forEach((overlay, index) => {
    const key = `${index}:${overlay.type}:${overlay.id}`;
    if (overlay.type === 'line' && overlay.points) {
      lines.push({
        key,
        options: { color: overlay.color ?? '#6b7280', lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
        points: overlay.points.map((point) => ({ time: point.time, value: point.value })),
      });
    } else if (overlay.type === 'hline' && overlay.price !== undefined && candles.length) {
      lines.push({
        key,
        options: {
          color: overlay.color ?? '#9ca3af',
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: overlay.label,
        },
        points: [
          { time: candles[0].time, value: overlay.price },
          { time: candles[candles.length - 1].time, value: overlay.price },
        ],
      });
    } else if (overlay.type === 'markers' && overlay.markers) {
      markers.push(...overlay.markers.map((marker) => ({
        time: marker.time,
        position: marker.position,
        color: marker.color,
        shape: marker.shape,
        text: marker.text,
      })));
    }
  });
  markers.sort((a, b) => a.time - b.time);
  return { lines, markers };
}

export function createOverlayState<S>(): OverlayState<S> {
  return { lines: new Map(), markersKey: '' };
}

export function syncOverlays<S>(
  chart: ChartLike<S>,
  state: OverlayState<S>,
  plan: OverlayPlan,
  setMarkers: (markers: MarkerSpec[]) => void,
): void {
  const wanted = new Set(plan.lines.map((line) => line.key));
  for (const key of [...state.lines.keys()]) {
    if (wanted.has(key)) continue;
    const entry = state.lines.get(key);
    if (entry) chart.removeSeries(entry.series);
    state.lines.delete(key);
  }

  for (const line of plan.lines) {
    const optionsKey = JSON.stringify(line.options);
    const dataKey = JSON.stringify(line.points);
    const existing = state.lines.get(line.key);
    if (existing && existing.optionsKey !== optionsKey) {
      chart.removeSeries(existing.series);
      state.lines.delete(line.key);
    }
    const entry = state.lines.get(line.key);
    if (!entry) {
      const series = chart.addLine(line.options);
      chart.setLineData(series, line.points);
      state.lines.set(line.key, { series, optionsKey, dataKey });
    } else if (entry.dataKey !== dataKey) {
      chart.setLineData(entry.series, line.points);
      entry.dataKey = dataKey;
    }
  }

  const markersKey = JSON.stringify(plan.markers);
  if (markersKey !== state.markersKey) {
    setMarkers(plan.markers);
    state.markersKey = markersKey;
  }
}
