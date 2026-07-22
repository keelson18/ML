import type { Candle } from '../types';

// Stochastic Oscillator: %K and %D
// Compares closing price to price range over a period
export function stochastic(
  candles: Candle[],
  kPeriod = 14,
  dPeriod = 3,
  smooth = 3,
): { k: number[]; d: number[] } {
  const n = candles.length;
  const k: number[] = new Array(n).fill(NaN);
  const d: number[] = new Array(n).fill(NaN);

  for (let i = kPeriod - 1; i < n; i++) {
    const high = Math.max(...candles.slice(i - kPeriod + 1, i + 1).map((c) => c.high));
    const low = Math.min(...candles.slice(i - kPeriod + 1, i + 1).map((c) => c.low));
    const range = high - low;
    k[i] = range === 0 ? 50 : ((candles[i].close - low) / range) * 100;
  }

  // Smooth %K
  const smoothedK = sma(k, smooth);
  // %D is SMA of %K
  const dLine = sma(smoothedK, dPeriod);

  for (let i = 0; i < n; i++) {
    k[i] = smoothedK[i];
    d[i] = dLine[i];
  }

  return { k, d };
}

function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (!isNaN(values[i])) sum += values[i];
    if (i >= period && !isNaN(values[i - period])) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

