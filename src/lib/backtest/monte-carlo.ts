// Monte Carlo Simulation: randomized path generation for robustness testing

export interface MonteCarloResult {
  iterations: number;
  meanReturn: number;
  medianReturn: number;
  stdDev: number;
  maxDrawdown: number;
  sharpeRatio: number;
  percentPositive: number;
  var95: number;  // Value at Risk (95% confidence)
}

export function monteCarloSimulation(
  historicalReturns: number[],
  initialCapital: number,
  numIterations = 1000,
  forecastPeriods = 252, // 1 year of daily data
): MonteCarloResult {
  const meanReturn = historicalReturns.reduce((s, r) => s + r, 0) / historicalReturns.length;
  const variance = historicalReturns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / historicalReturns.length;
  const stdDev = Math.sqrt(variance);

  const finalValues: number[] = [];
  const maxDrawdowns: number[] = [];

  for (let iter = 0; iter < numIterations; iter++) {
    let capital = initialCapital;
    let peak = capital;
    let maxDD = 0;

    for (let day = 0; day < forecastPeriods; day++) {
      // Random normal return using Box-Muller transform
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const dailyReturn = meanReturn + z * stdDev;

      capital *= (1 + dailyReturn);
      peak = Math.max(peak, capital);
      maxDD = Math.max(maxDD, (peak - capital) / peak);
    }

    finalValues.push(capital);
    maxDrawdowns.push(maxDD);
  }

  // Compute statistics
  const sorted = [...finalValues].sort((a, b) => a - b);
  const n = sorted.length;
  const meanFinal = sorted.reduce((s, v) => s + v, 0) / n;
  const medianFinal = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  const positiveCount = finalValues.filter((v) => v > initialCapital).length;

  const totalReturns = finalValues.map((v) => (v - initialCapital) / initialCapital);
  const returnMean = totalReturns.reduce((s, r) => s + r, 0) / n;
  const returnVar = totalReturns.reduce((s, r) => s + (r - returnMean) ** 2, 0) / n;
  const returnStd = Math.sqrt(returnVar);

  return {
    iterations: numIterations,
    meanReturn: returnMean,
    medianReturn: (medianFinal - initialCapital) / initialCapital,
    stdDev: returnStd,
    maxDrawdown: maxDrawdowns.reduce((a, b) => Math.max(a, b), 0),
    sharpeRatio: returnStd > 0 ? returnMean / returnStd : 0,
    percentPositive: (positiveCount / n) * 100,
    var95: (sorted[Math.floor(n * 0.05)] - initialCapital) / initialCapital,
  };
}

