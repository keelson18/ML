import type {
  LineWidth,
  SeriesMarkerPosition,
  SeriesMarkerShape,
  Time,
} from 'lightweight-charts';
import type { Candle } from '../lib/types';

export interface OverlayLine {
  type: 'line';
  data: Array<{ time: number; value: number }>;
  color?: string;
  width?: number;
}

export interface OverlayMarkers {
  type: 'markers';
  data: Array<{
    time: number;
    position: SeriesMarkerPosition;
    shape?: SeriesMarkerShape;
    color?: string;
    text?: string;
  }>;
}

export interface OverlayPriceLines {
  type: 'priceLines';
  data: Array<{ price: number; color?: string; title?: string }>;
}

export type ChartOverlay = OverlayLine | OverlayMarkers | OverlayPriceLines;

export interface PlannedLine {
  data: Array<{ time: Time; value: number }>;
  color: string;
  width: LineWidth;
}

export interface PlannedMarker {
  time: Time;
  position: SeriesMarkerPosition;
  shape: SeriesMarkerShape;
  color: string;
  text?: string;
}

export interface PlannedPriceLine {
  price: number;
  color: string;
  title: string;
}

export interface OverlayPlan {
  lines: PlannedLine[];
  markers: PlannedMarker[];
  priceLines: PlannedPriceLine[];
}

const LINE_WIDTHS: readonly LineWidth[] = [1, 2, 3, 4];

/** Lightweight Charts only accepts 1–4; clamp arbitrary overlay widths to the nearest valid value. */
export function toLineWidth(width: number | undefined): LineWidth {
  if (width === undefined || !Number.isFinite(width)) return 2;
  return LINE_WIDTHS.reduce((best, candidate) => (
    Math.abs(candidate - width) < Math.abs(best - width) ? candidate : best
  ), 2);
}

/**
 * Converts caller-supplied overlays into chart-ready data. Pure so that overlay
 * behavior can be tested without a DOM or a chart instance.
 */
export function planOverlays(
  overlays: ChartOverlay[] | undefined,
  colors: { primary: string; success: string; danger: string },
): OverlayPlan {
  const plan: OverlayPlan = { lines: [], markers: [], priceLines: [] };
  for (const overlay of overlays ?? []) {
    if (overlay.type === 'line') {
      const data = overlay.data
        .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))
        .map((point) => ({ time: point.time as Time, value: point.value }));
      if (data.length) plan.lines.push({ data, color: overlay.color ?? colors.primary, width: toLineWidth(overlay.width) });
    } else if (overlay.type === 'markers') {
      const markers = overlay.data
        .filter((marker) => Number.isFinite(marker.time))
        .map((marker) => ({
          time: marker.time as Time,
          position: marker.position,
          shape: marker.shape ?? 'circle',
          color: marker.color ?? colors.primary,
          ...(marker.text === undefined ? {} : { text: marker.text }),
        }));
      plan.markers.push(...markers);
    } else if (overlay.type === 'priceLines') {
      const priceLines = overlay.data
        .filter((line) => Number.isFinite(line.price))
        .map((line) => ({
          price: line.price,
          color: line.color ?? colors.primary,
          title: line.title ?? '',
        }));
      plan.priceLines.push(...priceLines);
    }
  }
  return plan;
}

/** Simple moving-average overlay for callers that want a trend line on the price chart. */
export function movingAverageOverlay(candles: Candle[], period: number, color?: string): OverlayLine | null {
  if (!Number.isInteger(period) || period < 1 || candles.length < period) return null;
  const data: Array<{ time: number; value: number }> = [];
  for (let index = period - 1; index < candles.length; index += 1) {
    let sum = 0;
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) sum += candles[cursor]!.close;
    data.push({ time: candles[index]!.time, value: sum / period });
  }
  return data.length ? { type: 'line', data, ...(color === undefined ? {} : { color }) } : null;
}
