import type { Candle } from '../types';

// Average Directional Index (ADX): measures trend strength
// Returns ADX, +DI, -DI for each index
export function adx(candles: Candle[], period = 14): { adx: number[]; plusDI: number[]; minusDI: number[] } {
  const n = candles.length;
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);
  const tr: number[] = new Array(n).fill(0);
  const plusDI: number[] = new Array(n).fill(NaN);
  const minusDI: number[] = new Array(n).fill(NaN);
  const adxLine: number[] = new Array(n).fill(NaN);
  const dx: number[] = new Array(n).fill(NaN);

  for (let i = 1; i < n; i++) {
    const highMove = candles[i].high - candles[i - 1].high;
    const lowMove = candles[i - 1].low - candles[i].low;

    // True Range
    tr[i] = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );

    // Directional Movement
    if (highMove > lowMove && highMove > 0) {
      plusDM[i] = highMove;
    }
    if (lowMove > highMove && lowMove > 0) {
      minusDM[i] = lowMove;
    }
  }

  // Smooth with Wilder's method
  const smoothedTR = wilderSmooth(tr, period);
  const smoothedPlusDM = wilderSmooth(plusDM, period);
  const smoothedMinusDM = wilderSmooth(minusDM, period);

  for (let i = period; i < n; i++) {
    const atr = smoothedTR[i];
    if (atr === 0) continue;
    plusDI[i] = (smoothedPlusDM[i] / atr) * 100;
    minusDI[i] = (smoothedMinusDM[i] / atr) * 100;

    const diSum = plusDI[i] + minusDI[i];
    if (diSum === 0) continue;
    dx[i] = (Math.abs(plusDI[i] - minusDI[i]) / diSum) * 100;
  }

  // ADX is smoothed DX
  const smoothedDX = wilderSmooth(dx.map((v) => isNaN(v) ? 0 : v), period);
  for (let i = period * 2 - 1; i < n; i++) {
    adxLine[i] = smoothedDX[i];
  }

  return { adx: adxLine, plusDI, minusDI };
}

function wilderSmooth(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(0);
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += values[i];
  out[period] = sum / period;
  for (let i = period + 1; i < values.length; i++) {
    out[i] = (out[i - 1] * (period - 1) + values[i]) / period;
  }
  return out;
}

