import { useMemo, useState } from 'react';
import { History, Play, RefreshCw } from 'lucide-react';
import type { Candle, Timeframe } from '../../lib/types';
import PriceChart from '../PriceChart';
import { runBacktest, type BacktestResult } from '../../lib/backtest/engine';
import { getStrategy, getStrategyAvailability, STRATEGY_REGISTRY, runStrategy } from '../../lib/strategies/index';

interface Props {
  candles: Candle[];
  timeframe: Timeframe;
  symbol: string;
  theme: 'light' | 'dark';
}

type Range = 100 | 500 | 'all';

export default function BacktestingCenter({ candles, timeframe, symbol, theme }: Props) {
  const [capitalInput, setCapitalInput] = useState('10000');
  const [range, setRange] = useState<Range>(100);
  const [selectedStrategy, setSelectedStrategy] = useState(STRATEGY_REGISTRY[0].id);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<{ strategyId: string; capital: number; candleCount: number } | null>(null);

  const selectedDefinition = getStrategy(selectedStrategy);
  const availability = useMemo(() => getStrategyAvailability(candles, timeframe), [candles, timeframe]);
  const selectedAvailability = availability.find(({ strategy }) => strategy.id === selectedStrategy);
  const testCandles = range === 'all' ? candles : candles.slice(-range);
  const canRun = Boolean(selectedDefinition && selectedAvailability?.eligible && testCandles.length >= 65 && Number(capitalInput) > 0);

  const runSelectedBacktest = () => {
    const capital = Number(capitalInput);
    if (!Number.isFinite(capital) || capital <= 0) {
      setRunError('Initial capital must be greater than zero.');
      return;
    }
    if (!selectedDefinition || !selectedAvailability?.eligible) {
      setRunError(selectedAvailability?.reason ?? 'Select an eligible strategy.');
      return;
    }
    if (testCandles.length < 65) {
      setRunError('At least 65 candles are required for the default warmup and holding period.');
      return;
    }

    setRunning(true);
    setRunError(null);
    window.setTimeout(() => {
      try {
        const nextResult = runBacktest(testCandles, (history) => runStrategy(history, timeframe, selectedStrategy), capital, 5);
        setResult(nextResult);
        setLastRun({ strategyId: selectedStrategy, capital, candleCount: testCandles.length });
      } catch (error) {
        setRunError(error instanceof Error ? error.message : 'Backtest could not be completed.');
        setResult(null);
      } finally {
        setRunning(false);
      }
    }, 0);
  };

  const equityCandles = useMemo(() => {
    if (!result || !testCandles.length) return [];
    return result.equity.map((value, index) => {
      const time = index === 0 ? testCandles[0].time : result.trades[index - 1]?.exitTime ?? testCandles[Math.min(index, testCandles.length - 1)].time;
      return { time, open: value, high: value, low: value, close: value, volume: 0 };
    });
  }, [result, testCandles]);

  const metrics = result && lastRun ? [
    { label: 'Win Rate', value: `${(result.metrics.winRate * 100).toFixed(1)}%`, color: 'text-success' },
    { label: 'Net Profit', value: `${result.metrics.totalReturn >= 0 ? '+' : ''}$${(lastRun.capital * result.metrics.totalReturn).toFixed(2)}`, color: result.metrics.totalReturn >= 0 ? 'text-success' : 'text-danger' },
    { label: 'Max Drawdown', value: `${(result.metrics.maxDrawdown * 100).toFixed(1)}%`, color: 'text-danger' },
    { label: 'Sharpe', value: result.metrics.sharpe.toFixed(2), color: 'text-primary' },
    { label: 'Total Trades', value: String(result.metrics.totalTrades), color: 'text-text' },
    { label: 'Timeframe', value: timeframe, color: 'text-primary' },
  ] : [
    { label: 'Win Rate', value: '--', color: 'text-muted' },
    { label: 'Net Profit', value: '--', color: 'text-muted' },
    { label: 'Max Drawdown', value: '--', color: 'text-muted' },
    { label: 'Sharpe', value: '--', color: 'text-muted' },
    { label: 'Total Trades', value: '--', color: 'text-muted' },
    { label: 'Timeframe', value: timeframe, color: 'text-primary' },
  ];

  return (
    <div className="page-frame space-y-6">
      <div className="page-heading">
        <div className="page-heading-copy">
          <div className="page-eyebrow"><History className="w-3.5 h-3.5" /> Research workspace</div>
          <h1>Backtesting Center</h1>
          <p>Run a portfolio-aware simulation against {symbol} using the same versioned strategy definitions as the live analysis desk.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Field label="Strategy">
          <select value={selectedStrategy} onChange={(event) => { setSelectedStrategy(event.target.value); setResult(null); setRunError(null); }} className="control-input">
            {STRATEGY_REGISTRY.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.name}</option>)}
          </select>
        </Field>
        <Field label="Asset"><div className="control-readonly">{symbol}</div></Field>
        <Field label="Date Range">
          <select value={range} onChange={(event) => setRange(event.target.value === 'all' ? 'all' : Number(event.target.value) as 100 | 500)} className="control-input">
            <option value={100}>Last 100 candles</option>
            <option value={500}>Last 500 candles</option>
            <option value="all">All available data ({candles.length})</option>
          </select>
        </Field>
        <Field label="Initial Capital"><input type="number" min="1" step="100" value={capitalInput} onChange={(event) => { setCapitalInput(event.target.value); setRunError(null); }} className="control-input" /></Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={runSelectedBacktest} disabled={running || !canRun} className="px-4 py-2 rounded-lg bg-primary text-black text-xs font-semibold disabled:opacity-50 flex items-center gap-2"><Play className="w-3.5 h-3.5" />{running ? 'Running...' : canRun ? 'Run backtest' : selectedAvailability?.reason ?? 'Need more candles'}</button>
        <span className="text-xs text-muted">Warmup: 60 bars · Holding period: 5 bars · No fees or slippage modeled</span>
      </div>
      {runError && <div role="alert" className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg p-3">{runError}</div>}

      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">{metrics.map((metric) => <div key={metric.label} className="bg-surface border border-border rounded-xl p-3"><div className="text-[10px] text-muted mb-1">{metric.label}</div><div className={`text-lg font-semibold tabular-nums ${metric.color}`}>{metric.value}</div></div>)}</div>

      <section className="bg-surface border border-border rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3"><h2 className="text-xs font-medium text-muted">Equity Curve</h2>{lastRun && <span className="text-[10px] text-muted">{getStrategy(lastRun.strategyId)?.name} · {lastRun.candleCount} candles · ${lastRun.capital.toLocaleString()}</span>}</div>
        <div className="h-64 border border-border rounded-lg overflow-hidden">{running ? <div className="h-full flex items-center justify-center text-xs text-muted"><RefreshCw className="w-4 h-4 animate-spin mr-2" />Running simulation</div> : equityCandles.length ? <PriceChart candles={equityCandles} overlays={[]} theme={theme} /> : <div className="h-full flex items-center justify-center text-xs text-muted">Run a backtest to render the equity curve.</div>}</div>
      </section>

      <section className="bg-surface border border-border rounded-xl p-4">
        <h2 className="text-xs font-medium text-muted mb-3">Trade History</h2>
        {result?.trades.length ? <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-muted border-b border-border"><th className="text-left py-2 pr-3">Entry</th><th className="text-left py-2 pr-3">Exit</th><th className="text-left py-2 pr-3">Side</th><th className="text-right py-2 pr-3">Entry Price</th><th className="text-right py-2 pr-3">Exit Price</th><th className="text-right py-2 pr-3">Size</th><th className="text-right py-2">P&L</th></tr></thead><tbody>{result.trades.slice().reverse().map((trade) => <tr key={`${trade.entryTime}-${trade.exitTime}`} className="border-b border-border/50"><td className="py-2 pr-3 whitespace-nowrap">{formatTime(trade.entryTime)}</td><td className="py-2 pr-3 whitespace-nowrap">{formatTime(trade.exitTime)}</td><td className={`py-2 pr-3 uppercase ${trade.side === 'buy' ? 'text-success' : 'text-danger'}`}>{trade.side}</td><td className="py-2 pr-3 text-right">{trade.entryPrice.toFixed(4)}</td><td className="py-2 pr-3 text-right">{trade.exitPrice.toFixed(4)}</td><td className="py-2 pr-3 text-right">{trade.size.toFixed(4)}</td><td className={`py-2 text-right ${trade.pnl >= 0 ? 'text-success' : 'text-danger'}`}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}</td></tr>)}</tbody></table></div> : <div className="text-xs text-muted text-center py-8">{result ? 'No eligible signals produced trades for this selection.' : 'No backtest results yet. Select parameters and run a simulation.'}</div>}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-xl p-4"><label className="block text-xs text-muted mb-1.5">{label}</label>{children}</div>;
}

function formatTime(time: number): string {
  return new Date(time * 1000).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}
