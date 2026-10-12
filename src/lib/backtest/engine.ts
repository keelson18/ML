import type { Candle, Signal } from '../types';

// Refactored backtest engine with portfolio tracking and multi-strategy support

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  side: 'buy' | 'sell';
  size: number;
  pnl: number;
  pnlPct: number;
  strategy: string;
  strategyId?: string;
  strategyVersion?: string;
  reason: string;
}

export interface BacktestResult {
  trades: BacktestTrade[];
  equity: number[];
  metrics: {
    totalReturn: number;
    maxDrawdown: number;
    winRate: number;
    totalTrades: number;
  };
}

export function runBacktest(
  candles: Candle[],
  signalFn: (c: Candle[]) => Signal[],
  initialCapital = 10000,
  holdBars = 5,
): BacktestResult {
  const trades: BacktestTrade[] = [];
  const equity: number[] = [initialCapital];
  let capital = initialCapital;
  const minCandles = 60;

  if (!Number.isFinite(initialCapital) || initialCapital <= 0 || !Number.isInteger(holdBars) || holdBars < 1) {
    throw new Error('Initial capital and holding period must be positive values.');
  }
  if (candles.length < minCandles + holdBars + 2) {
    return { trades, equity, metrics: { totalReturn: 0, maxDrawdown: 0, winRate: 0, totalTrades: 0 } };
  }

  for (let i = minCandles; i < candles.length - holdBars - 1; i++) {
    const slice = candles.slice(0, i + 1);
    const signals = signalFn(slice);
    const activeSignal = signals.find((s) => s.side !== 'neutral');

    if (!activeSignal) continue;

    const entryCandle = candles[i + 1];
    const exitCandle = candles[i + holdBars + 1];
    const entry = entryCandle.open;
    const exit = exitCandle.close;
    if (!Number.isFinite(entry) || !Number.isFinite(exit) || entry <= 0 || exit <= 0) continue;

    const side = activeSignal.side;
    const pnlPct = side === 'buy' ? (exit - entry) / entry : (entry - exit) / entry;
    const size = capital / entry;
    const pnl = size * (side === 'buy' ? exit - entry : entry - exit);

    const tradeSide = side === 'neutral' ? 'buy' : side as 'buy' | 'sell';
    trades.push({
      entryTime: entryCandle.time,
      exitTime: exitCandle.time,
      entryPrice: entry,
      exitPrice: exit,
      side: tradeSide,
      size,
      pnl,
      pnlPct,
      strategy: activeSignal.strategy,
      strategyId: activeSignal.strategyId,
      strategyVersion: activeSignal.strategyVersion,
      reason: activeSignal.reason,
    });

    // Update equity
    capital += pnl;
    equity.push(capital);
    i += holdBars;
  }

  // Calculate metrics
  const wins = trades.filter((t) => t.pnl > 0);
  const winRate = trades.length > 0 ? wins.length / trades.length : 0;
  const totalReturn = (capital - initialCapital) / initialCapital;
  let peak = initialCapital;
  let maxDrawdown = 0;
  for (const value of equity) {
    peak = Math.max(peak, value);
    maxDrawdown = Math.max(maxDrawdown, (peak - value) / peak);
  }

  return {
    trades,
    equity,
    metrics: {
      totalReturn,
      maxDrawdown,
      winRate,
      totalTrades: trades.length,
    },
  };
}
