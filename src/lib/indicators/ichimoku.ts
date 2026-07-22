import type { Candle } from '../types';

// Ichimoku Cloud: Complete trend/strength/support system
// Tenkan-sen (Conversion), Kijun-sen (Base), Senkou Span A/B (Cloud), Chikou Span (Lagging)
export function ichimoku(candles: Candle[]): {
  tenkan: number[];
  kijun: number[];
  senkouA: number[];
  senkouB: number[];
  chikou: number[];
} {
  const n = candles.length;
  const tenkan: number[] = new Array(n).fill(NaN);
  const kijun: number[] = new Array(n).fill(NaN);
  const senkouA: number[] = new Array(n).fill(NaN);
  const senkouB: number[] = new Array(n).fill(NaN);
  const chikou: number[] = new Array(n).fill(NaN);

  const tPeriod = 9;
  const kPeriod = 26;
  const sPeriod = 52;

  for (let i = sPeriod - 1; i < n; i++) {
    // Tenkan-sen (Conversion Line): 9-period high/low midpoint
    if (i >= tPeriod - 1) {
      const h9 = Math.max(...candles.slice(i - tPeriod + 1, i + 1).map((c) => c.high));
      const l9 = Math.min(...candles.slice(i - tPeriod + 1, i + 1).map((c) => c.low));
      tenkan[i] = (h9 + l9) / 2;
    }

    // Kijun-sen (Base Line): 26-period high/low midpoint
    if (i >= kPeriod - 1) {
      const h26 = Math.max(...candles.slice(i - kPeriod + 1, i + 1).map((c) => c.high));
      const l26 = Math.min(...candles.slice(i - kPeriod + 1, i + 1).map((c) => c.low));
      kijun[i] = (h26 + l26) / 2;
    }

    // Senkou Span A (Leading Span A): (Tenkan + Kijun) / 2, shifted forward 26 periods
    if (i >= kPeriod - 1 && !isNaN(tenkan[i]) && !isNaN(kijun[i])) {
      if (i + kPeriod < n) {
        senkouA[i + kPeriod] = (tenkan[i] + kijun[i]) / 2;
      }
    }

    // Senkou Span B (Leading Span B): 52-period high/low midpoint, shifted forward 26 periods
    if (i >= sPeriod - 1) {
      const h52 = Math.max(...candles.slice(i - sPeriod + 1, i + 1).map((c) => c.high));
      const l52 = Math.min(...candles.slice(i - sPeriod + 1, i + 1).map((c) => c.low));
      const b = (h52 + l52) / 2;
      if (i + kPeriod < n) {
        senkouB[i + kPeriod] = b;
      }
    }

    // Chikou Span (Lagging Span): current close shifted back 26 periods
    if (i >= kPeriod) {
      chikou[i - kPeriod] = candles[i].close;
    }
  }

  return { tenkan, kijun, senkouA, senkouB, chikou };
}

