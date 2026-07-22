// Hull Moving Average: reduces lag while maintaining smoothness
// HMA = WMA(2*WMA(n/2) - WMA(n), sqrt(n))
import { wma } from './wma';

export function hma(values: number[], period = 20): number[] {
  const halfPeriod = Math.floor(period / 2);
  const sqrtPeriod = Math.floor(Math.sqrt(period));

  const wma1 = wma(values, halfPeriod);
  const wma2 = wma(values, period);

  const diff: number[] = new Array(values.length).fill(NaN);
  for (let i = 0; i < values.length; i++) {
    if (!isNaN(wma1[i]) && !isNaN(wma2[i])) {
      diff[i] = 2 * wma1[i] - wma2[i];
    }
  }

  return wma(diff, sqrtPeriod);
}

