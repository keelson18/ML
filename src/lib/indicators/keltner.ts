import type { Candle } from '../types';
import { ema, atr } from '../indicators';

// Keltner Channels: EMA ± ATR-based volatility channels
export function keltner(
  candles: Candle[],
  period = 20,
  multiplier = 2,
): { upper: number[]; middle: number[]; lower: number[] } {
  const closes = candles.map((c) => c.close);
  const middle = ema(closes, period);
  const atm = atr(candles, period);

  const upper: number[] = new Array(candles.length).fill(NaN);
  const lower: number[] = new Array(candles.length).fill(NaN);

  for (let i = 0; i < candles.length; i++) {
    if (!isNaN(middle[i]) && !isNaN(atm[i])) {
      upper[i] = middle[i] + atm[i] * multiplier;
      lower[i] = middle[i] - atm[i] * multiplier;
    }
  }

  return { upper, middle, lower };
}

