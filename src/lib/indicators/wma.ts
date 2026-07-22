// Weighted Moving Average: linear weighting (most recent gets highest weight)
export function wma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  const weightSum = (period * (period + 1)) / 2;

  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += values[i - j] * (period - j);
    }
    out[i] = sum / weightSum;
  }
  return out;
}

