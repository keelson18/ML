// Performance Metrics: Sharpe, Sortino, Profit Factor, Calmar, etc.

export interface PerformanceMetrics {
  totalReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  profitFactor: number;
  winRate: number;
  totalTrades: number;
  maxDrawdown: number;
  calmarRatio: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number; // Average expected return per trade
}

export function calculateMetrics(
  trades: { pnl: number; entryTime: number; exitTime: number }[],
  riskFreeRate = 0.02,
): PerformanceMetrics {
  if (trades.length === 0) {
    return {
      totalReturn: 0, annualizedReturn: 0, volatility: 0, sharpeRatio: 0,
      sortinoRatio: 0, profitFactor: 0, winRate: 0, totalTrades: 0,
      maxDrawdown: 0, calmarRatio: 0, avgWin: 0, avgLoss: 0, expectancy: 0,
    };
  }

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  // Time period in years
  const timeRange = trades.length >= 2
    ? (trades[trades.length - 1].exitTime - trades[0].entryTime) / (365.25 * 24 * 3600)
    : 1;

  const totalReturn = totalPnl;
  const annualizedReturn = timeRange > 0 ? Math.pow(1 + totalReturn, 1 / timeRange) - 1 : totalReturn;

  // Returns for volatility calculation
  const returns = trades.map((t) => t.pnl);
  const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / returns.length;
  const volatility = Math.sqrt(variance) * Math.sqrt(252 / trades.length);

  // Sharpe Ratio
  const excessReturn = annualizedReturn - riskFreeRate;
  const sharpeRatio = volatility > 0 ? excessReturn / volatility : 0;

  // Sortino Ratio (downside deviation only)
  const downsideReturns = returns.filter((r) => r < 0);
  const downsideVariance = downsideReturns.length > 0
    ? downsideReturns.reduce((s, r) => s + r * r, 0) / downsideReturns.length
    : 0;
  const downsideDev = Math.sqrt(downsideVariance) * Math.sqrt(252 / trades.length);
  const sortinoRatio = downsideDev > 0 ? excessReturn / downsideDev : 0;

  // Profit Factor
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Win Rate
  const winRate = trades.length > 0 ? wins.length / trades.length : 0;

  // Max Drawdown (simplified)
  let peak = 0;
  let maxDD = 0;
  let runningPnl = 0;
  for (const t of trades) {
    runningPnl += t.pnl;
    peak = Math.max(peak, runningPnl);
    maxDD = Math.max(maxDD, (peak - runningPnl) / (1 + peak));
  }

  // Calmar Ratio
  const calmarRatio = maxDD > 0 ? annualizedReturn / maxDD : 0;

  // Averages
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;

  // Expectancy
  const expectancy = winRate * avgWin + (1 - winRate) * avgLoss;

  return {
    totalReturn,
    annualizedReturn,
    volatility,
    sharpeRatio,
    sortinoRatio,
    profitFactor,
    winRate,
    totalTrades: trades.length,
    maxDrawdown: maxDD,
    calmarRatio,
    avgWin,
    avgLoss,
    expectancy,
  };
}

