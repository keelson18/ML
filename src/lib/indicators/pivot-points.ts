import type { Candle } from '../types';

// Pivot Points: Classic, Fibonacci, Woodie, Camarilla
// All calculated from previous period's high, low, close

export interface PivotPoints {
  pivot: number;
  r1: number; r2: number; r3: number;
  s1: number; s2: number; s3: number;
}

// Classic Pivot Points
export function classicPivotPoints(candles: Candle[]): PivotPoints | null {
  if (candles.length < 2) return null;
  const prev = candles[candles.length - 2];
  const h = prev.high, l = prev.low, c = prev.close;
  const pp = (h + l + c) / 3;
  return {
    pivot: pp,
    r1: 2 * pp - l,
    r2: pp + (h - l),
    r3: h + 2 * (pp - l),
    s1: 2 * pp - h,
    s2: pp - (h - l),
    s3: l - 2 * (h - pp),
  };
}

// Fibonacci Pivot Points
export function fibonacciPivotPoints(candles: Candle[]): PivotPoints | null {
  if (candles.length < 2) return null;
  const prev = candles[candles.length - 2];
  const h = prev.high, l = prev.low, c = prev.close;
  const pp = (h + l + c) / 3;
  const range = h - l;
  return {
    pivot: pp,
    r1: pp + range * 0.382,
    r2: pp + range * 0.618,
    r3: pp + range * 1.0,
    s1: pp - range * 0.382,
    s2: pp - range * 0.618,
    s3: pp - range * 1.0,
  };
}

// Woodie Pivot Points
export function woodiePivotPoints(candles: Candle[]): PivotPoints | null {
  if (candles.length < 2) return null;
  const prev = candles[candles.length - 2];
  const h = prev.high, l = prev.low, c = prev.close;
  const pp = (h + l + 2 * c) / 4;
  return {
    pivot: pp,
    r1: 2 * pp - l,
    r2: pp + (h - l),
    r3: h + 2 * (pp - l),
    s1: 2 * pp - h,
    s2: pp - (h - l),
    s3: l - 2 * (h - pp),
  };
}

// Camarilla Pivot Points
export function camarillaPivotPoints(candles: Candle[]): PivotPoints | null {
  if (candles.length < 2) return null;
  const prev = candles[candles.length - 2];
  const h = prev.high, l = prev.low, c = prev.close;
  const range = h - l;
  const pp = c; // Camarilla uses close as pivot
  return {
    pivot: pp,
    r1: c + range * 0.0916,
    r2: c + range * 0.1833,
    r3: c + range * 0.2750,
    s1: c - range * 0.0916,
    s2: c - range * 0.1833,
    s3: c - range * 0.2750,
  };
}

