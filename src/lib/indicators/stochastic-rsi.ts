import { rsi } from '../indicators';

// Stochastic RSI: RSI applied to Stochastic
// More sensitive than regular RSI, generates more signals
export function stochasticRsi(
  closes: number[],
  period = 14,
  kPeriod = 3,
  dPeriod = 3,
): { k: number[]; d: number[] } {
  const n = closes.length;
  const rsiValues = rsi(closes, period);

  const k: number[] = new Array(n).fill(NaN);
  const rawK: number[] = new Array(n).fill(NaN);

  for (let i = period + kPeriod - 1; i < n; i++) {
    const slice = rsiValues.slice(i - kPeriod + 1, i + 1);
    const minRsi = Math.min(...slice.filter((v) => !isNaN(v)));
    const maxRsi = Math.max(...slice.filter((v) => !isNaN(v)));
    const range = maxRsi - minRsi;
    rawK[i] = range === 0 ? 50 : ((rsiValues[i] - minRsi) / range) * 100;
  }

  // Smooth %K
  for (let i = kPeriod - 1; i < n; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (!isNaN(rawK[j])) { sum += rawK[j]; count++; }
    }
    k[i] = count > 0 ? sum / count : NaN;
  }

  // %D is SMA of %K
  const d: number[] = new Array(n).fill(NaN);
  for (let i = dPeriod - 1; i < n; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) {
      if (!isNaN(k[j])) { sum += k[j]; count++; }
    }
    d[i] = count > 0 ? sum / count : NaN;
  }

  return { k, d };
}

