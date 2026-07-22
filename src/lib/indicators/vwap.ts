import type { Candle } from '../types';

// Volume Weighted Average Price (VWAP): cumulative
export function vwap(candles: Candle[]): number[] {
  const n = candles.length;
  const out: number[] = new Array(n).fill(NaN);
  let cumPV = 0;
  let cumV = 0;

  for (let i = 0; i < n; i++) {
    const typicalPrice = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumPV += typicalPrice * candles[i].volume;
    cumV += candles[i].volume;
    out[i] = cumV > 0 ? cumPV / cumV : typicalPrice;
  }

  return out;
}

