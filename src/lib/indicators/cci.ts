import type { Candle } from '../types';

// Commodity Channel Index (CCI): measures current price relative to average price
export function cci(candles: Candle[], period = 20): number[] {
  const n = candles.length;
  const tp: number[] = candles.map((c) => (c.high + c.low + c.close) / 3);
  const out: number[] = new Array(n).fill(NaN);

  for (let i = period - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += tp[j];
    const mean = sum / period;

    let madSum = 0;
    for (let j = i - period + 1; j <= i; j++) madSum += Math.abs(tp[j] - mean);
    const mad = madSum / period;

    out[i] = mad === 0 ? 0 : (tp[i] - mean) / (0.015 * mad);
  }

  return out;
}

