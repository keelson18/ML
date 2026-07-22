import type { Candle } from '../types';

// Parabolic SAR (Stop and Reverse): trailing stop indicator
export function parabolicSar(candles: Candle[], acceleration = 0.02, maxAcceleration = 0.2): number[] {
  const n = candles.length;
  const sar: number[] = new Array(n).fill(NaN);
  if (n < 2) return sar;

  let isUp = candles[0].close <= candles[1].close;
  let ep = isUp ? candles[1].high : candles[1].low;
  let af = acceleration;
  sar[0] = candles[0].close;

  for (let i = 1; i < n; i++) {
    const prevSar = sar[i - 1];
    const prevEp = ep;
    const prevAf = af;

    // Calculate SAR
    sar[i] = prevSar + prevAf * (prevEp - prevSar);

    // Ensure SAR doesn't exceed previous candle's range
    if (isUp) {
      sar[i] = Math.min(sar[i], Math.min(candles[i - 1].low, candles[i].low));
      if (sar[i] > candles[i].low) {
        // Reversal to downtrend
        isUp = false;
        ep = candles[i].low;
        af = acceleration;
        sar[i] = prevEp; // Start SAR at previous extreme point
      } else if (candles[i].high > ep) {
        ep = candles[i].high;
        af = Math.min(af + acceleration, maxAcceleration);
      }
    } else {
      sar[i] = Math.max(sar[i], Math.max(candles[i - 1].high, candles[i].high));
      if (sar[i] < candles[i].high) {
        // Reversal to uptrend
        isUp = true;
        ep = candles[i].high;
        af = acceleration;
        sar[i] = prevEp;
      } else if (candles[i].low < ep) {
        ep = candles[i].low;
        af = Math.min(af + acceleration, maxAcceleration);
      }
    }
  }

  return sar;
}

