import type { Candle } from '../types';

// Money Flow Index (MFI): volume-weighted RSI
export function mfi(candles: Candle[], period = 14): number[] {
  const n = candles.length;
  const out: number[] = new Array(n).fill(NaN);
  const raw: number[] = new Array(n).fill(NaN);
  const moneyFlow: number[] = new Array(n).fill(0);
  const positiveFlow: number[] = new Array(n).fill(0);
  const negativeFlow: number[] = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    moneyFlow[i] = tp * candles[i].volume;
  }

  for (let i = 1; i < n; i++) {
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    const prevTp = (candles[i - 1].high + candles[i - 1].low + candles[i - 1].close) / 3;
    if (tp > prevTp) {
      positiveFlow[i] = moneyFlow[i];
    } else if (tp < prevTp) {
      negativeFlow[i] = moneyFlow[i];
    }
  }

  for (let i = period; i < n; i++) {
    let posSum = 0;
    let negSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      posSum += positiveFlow[j];
      negSum += negativeFlow[j];
    }
    raw[i] = negSum === 0 ? 100 : 100 - 100 / (1 + posSum / negSum);
    out[i] = raw[i];
  }

  return out;
}

