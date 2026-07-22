import type { Candle } from '../types';

// Donchian Channels: Highest High / Lowest Low over a period
export function donchian(
  candles: Candle[],
  period = 20,
): { upper: number[]; middle: number[]; lower: number[] } {
  const n = candles.length;
  const upper: number[] = new Array(n).fill(NaN);
  const lower: number[] = new Array(n).fill(NaN);
  const middle: number[] = new Array(n).fill(NaN);

  for (let i = period - 1; i < n; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    upper[i] = Math.max(...slice.map((c) => c.high));
    lower[i] = Math.min(...slice.map((c) => c.low));
    middle[i] = (upper[i] + lower[i]) / 2;
  }

  return { upper, middle, lower };
}

