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
  reason: string;
}

export interface BacktestResult {
  trades: BacktestTrade[];
  equity: number[];
  metrics: {
    totalReturn: number;
    maxDrawdown: number;
    sharpe: number;
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

  if (candles.length < minCandles + holdBars) {
    return { trades, equity, metrics: { totalReturn: 0, maxDrawdown: 0, sharpe: 0, winRate: 0, totalTrades: 0 } };
  }

  let peak = capital;

  for (let i = minCandles; i < candles.length - holdBars; i++) {
    const slice = candles.slice(0, i + 1);
    const signals = signalFn(slice);
    const activeSignal = signals.find((s) => s.side !== 'neutral');

    if (!activeSignal) continue;

    const entry = candles[i].close;
    const exit = candles[i + holdBars].close;

    const side = activeSignal.side;
    const pnlPct = side === 'buy' ? (exit - entry) / entry : (entry - exit) / entry;
    const pnl = capital * pnlPct;

    const tradeSide = side === 'neutral' ? 'buy' : side as 'buy' | 'sell';
    trades.push({
      entryTime: candles[i].time,
      exitTime: candles[i + holdBars].time,
      entryPrice: entry,
      exitPrice: exit,
      side: tradeSide,
      size: capital / entry,
      pnl,
      pnlPct,
      strategy: activeSignal.strategy,
      reason: activeSignal.reason,
    });

    // Update equity
    capital += pnl;
    equity.push(capital);
    peak = Math.max(peak, capital);
  }

  // Calculate metrics
  const wins = trades.filter((t) => t.pnl > 0);
  const winRate = trades.length > 0 ? wins.length / trades.length : 0;
  const totalReturn = (capital - initialCapital) / initialCapital;
  const maxDrawdown = equity.reduce(
    (max, val, idx) => {
      const pk = Math.max(...equity.slice(0, idx + 1));
      const dd = (pk - val) / pk;
      return Math.max(max, dd);
    },
    0,
  );

  // Sharpe (simplified)
  const returns = trades.map((t) => t.pnlPct);
  const avgReturn = returns.length > 0 ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
  const variance = returns.length > 0
    ? returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / returns.length
    : 0;
  const sharpe = variance > 0 ? avgReturn / Math.sqrt(variance) * Math.sqrt(252) : 0;

  return {
    trades,
    equity,
    metrics: {
      totalReturn,
      maxDrawdown,
      sharpe,
      winRate,
      totalTrades: trades.length,
    },
  };
}

