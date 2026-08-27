import { useState } from 'react';
import { History, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import type { Candle, Timeframe } from '../../lib/types';

interface Props {
  candles: Candle[];
  timeframe: Timeframe;
}

export default function BacktestingCenter({ candles: _candles, timeframe: _timeframe }: Props) {
  const [capital] = useState(10000);

  const metrics = [
    { label: 'Win Rate', value: '--', color: 'text-success' },
    { label: 'Profit Factor', value: '--', color: 'text-text' },
    { label: 'Max Drawdown', value: '--', color: 'text-danger' },
    { label: 'Sharpe Ratio', value: '--', color: 'text-primary' },
    { label: 'Total Trades', value: '0', color: 'text-text' },
    { label: 'Net Profit', value: '--', color: 'text-success' },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <History className="w-4 h-4 text-primary" /> Backtesting Center
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4">
          <label className="block text-xs text-muted mb-1.5">Strategy</label>
          <select className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-xs focus:outline-none focus:border-primary">
            <option>All Strategies</option>
            <option>MA Crossover</option>
            <option>RSI Divergence</option>
            <option>Bollinger</option>
          </select>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <label className="block text-xs text-muted mb-1.5">Asset</label>
          <select className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-xs focus:outline-none focus:border-primary">
            <option>Current Symbol</option>
          </select>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <label className="block text-xs text-muted mb-1.5">Date Range</label>
          <select className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-xs focus:outline-none focus:border-primary">
            <option>Last 100 candles</option>
            <option>Last 500 candles</option>
            <option>All data</option>
          </select>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <label className="block text-xs text-muted mb-1.5">Initial Capital</label>
          <input type="number" value={capital} className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-xs focus:outline-none focus:border-primary" readOnly />
        </div>
      </div>

      {/* Results Grid */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="bg-surface border border-border rounded-xl p-3">
            <div className="text-[10px] text-muted mb-1">{m.label}</div>
            <div className={`text-lg font-semibold tabular-nums ${m.color}`}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Equity Curve Placeholder */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <h3 className="text-xs font-medium text-muted mb-3">Equity Curve</h3>
        <div className="h-48 flex items-center justify-center text-xs text-muted border border-dashed border-border rounded-lg">
          Run a backtest to see the equity curve
        </div>
      </div>

      {/* Trade History Placeholder */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <h3 className="text-xs font-medium text-muted mb-3">Trade History</h3>
        <div className="text-xs text-muted text-center py-8">No backtest results yet. Select parameters and run a backtest.</div>
      </div>
    </div>
  );
}
