import type { Candle } from './types';

// Simple moving average: average of last `period` closes ending at index i.
export function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

// Exponential moving average: recursive, weights recent prices more.
export function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < values.length; i++) {
    if (i === 0) {
      prev = values[i];
      out[i] = prev;
      continue;
    }
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// RSI via Wilder's smoothing. Returns 0..100 per index.
export function rsi(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gain += ch; else loss -= ch;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = 100 - 100 / (1 + (avgLoss === 0 ? 100 : avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

// MACD: 12-EMA minus 26-EMA, signal = 9-EMA of MACD, histogram = MACD - signal.
export function macd(closes: number[]): { macd: number[]; signal: number[]; hist: number[] } {
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const macdLine = closes.map((_, i) => fast[i] - slow[i]);
  const signal = ema(macdLine, 9);
  const hist = macdLine.map((m, i) => m - signal[i]);
  return { macd: macdLine, signal, hist };
}

// Bollinger Bands: SMA ± k * stddev. Returns upper, middle, lower, and width.
export function bollinger(closes: number[], period = 20, k = 2): {
  upper: number[]; middle: number[]; lower: number[]; width: number[];
} {
  const mid = sma(closes, period);
  const upper: number[] = new Array(closes.length).fill(NaN);
  const lower: number[] = new Array(closes.length).fill(NaN);
  const width: number[] = new Array(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (closes[j] - mid[i]) ** 2;
    const sd = Math.sqrt(sumSq / period);
    upper[i] = mid[i] + k * sd;
    lower[i] = mid[i] - k * sd;
    width[i] = (upper[i] - lower[i]) / mid[i];
  }
  return { upper, middle: mid, lower, width };
}

// Average True Range: Wilder smoothing of true range. Used for stop/target sizing.
export function atr(candles: Candle[], period = 14): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  if (candles.length <= period) return out;
  const tr: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) { tr.push(candles[i].high - candles[i].low); continue; }
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  let prev = sum / period;
  out[period] = prev;
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

// Local extrema (swing highs/lows) using a window of ±left/right bars.
export function findSwings(candles: Candle[], left = 3, right = 3): {
  highs: { index: number; time: number; value: number }[];
  lows: { index: number; time: number; value: number }[];
} {
  const highs: { index: number; time: number; value: number }[] = [];
  const lows: { index: number; time: number; value: number }[] = [];
  for (let i = left; i < candles.length - right; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) highs.push({ index: i, time: candles[i].time, value: candles[i].high });
    if (isLow) lows.push({ index: i, time: candles[i].time, value: candles[i].low });
  }
  return { highs, lows };
}

// Pearson correlation helper for divergence detection.
export function correlation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}

// 