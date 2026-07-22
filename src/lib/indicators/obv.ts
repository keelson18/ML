import type { Candle } from '../types';

// On-Balance Volume (OBV): cumulative volume based on price direction
export function obv(candles: Candle[]): number[] {
  const n = candles.length;
  const out: number[] = new Array(n).fill(NaN);
  if (n === 0) return out;

  out[0] = candles[0].volume;

  for (let i = 1; i < n; i++) {
    if (candles[i].close > candles[i - 1].close) {
      out[i] = out[i - 1] + candles[i].volume;
    } else if (candles[i].close < candles[i - 1].close) {
      out[i] = out[i - 1] - candles[i].volume;
    } else {
      out[i] = out[i - 1];
    }
  }

  return out;
}

