import type { Candle, Signal, Overlay } from '../types';
import { findSwings } from '../indicators';

// Extracted legacy pattern detection functions from original strategies.ts
// These are kept for backward compatibility

export function detectHeadShoulders(candles: Candle[]): Signal | null {
  if (candles.length < 40) return null;
  const { highs } = findSwings(candles, 3, 3);
  if (highs.length < 3) return null;
  const last3 = highs.slice(-3);
  const [a, b, c] = last3;
  const isRegular = b.value > a.value && b.value > c.value && Math.abs(a.value - c.value) / b.value < 0.08;
  const isInverse = b.value < a.value && b.value < c.value && Math.abs(a.value - c.value) / b.value < 0.08;
  if (!isRegular && !isInverse) return null;
  const last = candles[candles.length - 1].close;
  const neckline = Math.min(a.value, c.value);
  if (isRegular && last < neckline) {
    return { strategy: 'Head & Shoulders', side: 'sell', confidence: 0.62, reason: 'Bearish H&S confirmed, neckline broken', overlays: [markerOverlay(last3, 'arrowDown', 'H&S')] };
  }
  if (isInverse && last > neckline) {
    return { strategy: 'Inverse H&S', side: 'buy', confidence: 0.62, reason: 'Bullish inverse H&S confirmed, neckline broken', overlays: [markerOverlay(last3, 'arrowUp', 'iH&S')] };
  }
  return null;
}

export function detectDoubleTopBottom(candles: Candle[]): Signal | null {
  if (candles.length < 30) return null;
  const { highs, lows } = findSwings(candles, 3, 3);
  if (highs.length >= 2) {
    const [a, b] = highs.slice(-2);
    if (Math.abs(a.value - b.value) / a.value < 0.03 && b.time - a.time > 0) {
      const last = candles[candles.length - 1].close;
      const trough = Math.min(...candles.slice(a.index, b.index + 1).map((c) => c.low));
      if (last < trough) {
        return { strategy: 'Double Top', side: 'sell', confidence: 0.58, reason: 'Double top confirmed by breakdown', overlays: [markerOverlay([a, b], 'arrowDown', 'DT')] };
      }
    }
  }
  if (lows.length >= 2) {
    const [a, b] = lows.slice(-2);
    if (Math.abs(a.value - b.value) / a.value < 0.03 && b.time - a.time > 0) {
      const last = candles[candles.length - 1].close;
      const peak = Math.max(...candles.slice(a.index, b.index + 1).map((c) => c.high));
      if (last > peak) {
        return { strategy: 'Double Bottom', side: 'buy', confidence: 0.58, reason: 'Double bottom confirmed by breakout', overlays: [markerOverlay([a, b], 'arrowUp', 'DB')] };
      }
    }
  }
  return null;
}

export function detectTriangleFlag(candles: Candle[]): Signal | null {
  if (candles.length < 40) return null;
  const { highs, lows } = findSwings(candles, 2, 2);
  if (highs.length < 2 || lows.length < 2) return null;
  const hh = highs.slice(-2), ll = lows.slice(-2);
  const slopeHigh = (hh[1].value - hh[0].value) / (hh[1].index - hh[0].index || 1);
  const slopeLow = (ll[1].value - ll[0].value) / (ll[1].index - ll[0].index || 1);
  const converging = Math.sign(slopeHigh) !== Math.sign(slopeLow) && Math.abs(slopeHigh - slopeLow) > 0;
  const flagParallel = Math.sign(slopeHigh) === Math.sign(slopeLow) && Math.abs(slopeHigh - slopeLow) / (Math.abs(slopeHigh) + 1e-9) < 0.3;
  if (converging) {
    const last = candles[candles.length - 1].close;
    const side = last > (hh[0].value + hh[1].value) / 2 ? 'buy' as const : 'neutral' as const;
    return { strategy: 'Triangle', side, confidence: 0.5, reason: 'Converging trendlines — breakout pending', overlays: [lineOverlay([hh[0], hh[1]], '#f59e0b', 'resist'), lineOverlay([ll[0], ll[1]], '#f59e0b', 'support')] };
  }
  if (flagParallel) {
    const dir = slopeHigh > 0 ? 'buy' as const : 'sell' as const;
    return { strategy: 'Flag', side: dir, confidence: 0.48, reason: 'Parallel channel — flag continuation likely', overlays: [lineOverlay([hh[0], hh[1]], '#06b6d4', 'upper'), lineOverlay([ll[0], ll[1]], '#06b6d4', 'lower')] };
  }
  return null;
}

function markerOverlay(swings: { time: number; value: number }[], shape: 'arrowUp' | 'arrowDown', label: string): Overlay {
  return { type: 'markers' as const, id: label, markers: swings.map((s) => ({ time: s.time, position: 'belowBar' as const, color: shape === 'arrowUp' ? '#22c55e' : '#ef4444', shape, text: label })) };
}

function lineOverlay(points: { time: number; value: number }[], color: string, label: string): Overlay {
  return { type: 'line' as const, id: label, points, color, label };
}

