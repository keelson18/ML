import type { Candle, Overlay } from './types';

export function normalizeCandles(candles: Candle[]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const candle of candles) {
    if (!Number.isFinite(candle.time) || !Number.isFinite(candle.open) || !Number.isFinite(candle.high) || !Number.isFinite(candle.low) || !Number.isFinite(candle.close) || !Number.isFinite(candle.volume)) continue;
    if (candle.high < candle.low || candle.open < candle.low || candle.open > candle.high || candle.close < candle.low || candle.close > candle.high) continue;
    byTime.set(Math.floor(candle.time), { ...candle, time: Math.floor(candle.time) });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

export function normalizeOverlays(overlays: Overlay[], candles: Candle[]): Overlay[] {
  const first = candles[0]?.time;
  const last = candles[candles.length - 1]?.time;
  const result: Overlay[] = [];
  for (const overlay of overlays) {
    if (overlay.type === 'line') {
      const points = normalizePoints(overlay.points ?? []);
      if (points.length > 1) result.push({ ...overlay, points });
    } else if (overlay.type === 'hline') {
      if (Number.isFinite(overlay.price) && first !== undefined && last !== undefined) result.push({ ...overlay, price: overlay.price });
    } else if (overlay.type === 'markers') {
      const markers = (overlay.markers ?? []).filter((marker) => Number.isFinite(marker.time)).sort((a, b) => a.time - b.time);
      if (markers.length) result.push({ ...overlay, markers });
    }
  }
  return result;
}

function normalizePoints(points: { time: number; value: number }[]): { time: number; value: number }[] {
  const byTime = new Map<number, { time: number; value: number }>();
  for (const point of points) {
    if (Number.isFinite(point.time) && Number.isFinite(point.value)) {
      byTime.set(Math.floor(point.time), { time: Math.floor(point.time), value: point.value });
    }
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}
