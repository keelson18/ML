import { useMemo, useState } from 'react';
import { History, Play, RefreshCw } from 'lucide-react';
import type { Candle, Timeframe } from '../../lib/types';
import { runBacktest, type BacktestResult } from '../../lib/backtest/engine';
import { getStrategy, getStrategyAvailability, STRATEGY_CATEGORIES, STRATEGY_REGISTRY, runStrategy } from '../../lib/strategies/index';

// Deprecated: this exploratory page is intentionally not imported by the app shell.
// The live backtesting experience is the canonical BacktestingCenter route in Dashboard.tsx.

interface Props {
  candles: Candle[];
  timeframe: Timeframe;
  symbol: string;
  theme: 'light' | 'dark';
  marketLoading: boolean;
  marketError: string | null;
  onRetryMarketData: () => void;
}

type Range = 100 | 500 | 'all';

export default function ExploratoryBacktesting({ candles, timeframe, symbol, theme: _theme, marketLoading, marketError, onRetryMarketData }: Props) {
  const [capitalInput, setCapitalInput] = useState('10000');
  const [range, setRange] = useState<Range>(100);
  const [selectedStrategy, setSelectedStrategy] = useState(STRATEGY_REGISTRY[0].id);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<{ strategyId: string; capital: number; candleCount: number } | null>(null);

  const selectedDefinition = getStrategy(selectedStrategy);
  const testCandles = useMemo(() => range === 'all' ? candles : candles.slice(-range), [candles, range]);
  const availability = useMemo(() => getStrategyAvailability(testCandles, timeframe), [testCandles, timeframe]);
  const selectedAvailability = availability.find(({ strategy }) => strategy.id === selectedStrategy);
  const minimumTestCandles = Math.max(67, (selectedDefinition?.minCandles ?? 0) + 7);
  const canRun = Boolean(!marketLoading && !marketError && selectedDefinition && selectedAvailability?.eligible && testCandles.length >= minimumTestCandles && Number(capitalInput) > 0);

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
    if (testCandles.length < minimumTestCandles) {
      setRunError(`At least ${minimumTestCandles} candles are required for this strategy and the holding period.`);
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

  const equityPoints = useMemo(() => {
    if (!result || !result.equity.length) return [];
    const values = result.equity;
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = Math.max(maxValue - minValue, 1);
    return values.map((value, index) => {
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
      const y = 100 - ((value - minValue) / range) * 100;
      return `${x},${y}`;
    });
  }, [result]);

  const metrics = result && lastRun ? [
    { label: 'Win Rate', value: `${(result.metrics.winRate * 100).toFixed(1)}%`, color: 'text-success' },
    { label: 'Net Profit', value: `${result.metrics.totalReturn >= 0 ? '+' : ''}$${(lastRun.capital * result.metrics.totalReturn).toFixed(2)}`, color: result.metrics.totalReturn >= 0 ? 'text-success' : 'text-danger' },
    { label: 'Max Drawdown', value: `${(result.metrics.maxDrawdown * 100).toFixed(1)}%`, color: 'text-danger' },
    { label: 'Total Trades', value: String(result.metrics.totalTrades), color: 'text-text' },
    { label: 'Timeframe', value: timeframe, color: 'text-primary' },
  ] : [
    { label: 'Win Rate', value: '--', color: 'text-muted' },
    { label: 'Net Profit', value: '--', color: 'text-muted' },
    { label: 'Max Drawdown', value: '--', color: 'text-muted' },
    { label: 'Total Trades', value: '--', color: 'text-muted' },
    { label: 'Timeframe', value: timeframe, color: 'text-primary' },
  ];

  return (
    <div className="page-frame space-y-6">
      <div className="page-heading">
        <div className="page-heading-copy">
          <div className="page-eyebrow"><History className="w-3.5 h-3.5" /> Research workspace</div>
          <h1>Backtesting Center</h1>
          <p>Backtest one versioned strategy against the selected historical {symbol} candles using next-bar entries and a fixed holding period.</p>
        </div>
      </div>
      <div role="note" className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">Exploratory results only: this browser backtest does not model fees, spread, slippage, or live execution; use the server-backed Backtesting Center for authoritative results.</div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Field id="backtest-strategy" label="Strategy">
          <select id="backtest-strategy" value={selectedStrategy} onChange={(event) => { setSelectedStrategy(event.target.value); setResult(null); setRunError(null); }} className="control-input">
            {STRATEGY_CATEGORIES.map((category) => {
              const strategies = STRATEGY_REGISTRY.filter((strategy) => strategy.category === category);
              return strategies.length ? <optgroup key={category} label={category}>{strategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.name}</option>)}</optgroup> : null;
            })}
          </select>
        </Field>
        <Field label="Asset"><div className="control-readonly">{symbol}</div></Field>
        <Field id="backtest-range" label="Date Range">
          <select id="backtest-range" value={range} onChange={(event) => { setRange(event.target.value === 'all' ? 'all' : Number(event.target.value) as 100 | 500); setResult(null); setRunError(null); }} className="control-input">
            <option value={100}>Last 100 candles</option>
            <option value={500}>Last 500 candles</option>
            <option value="all">All available data ({candles.length})</option>
          </select>
        </Field>
        <Field id="backtest-capital" label="Initial Capital"><input id="backtest-capital" type="number" min="1" step="100" value={capitalInput} onChange={(event) => { setCapitalInput(event.target.value); setRunError(null); }} className="control-input" /></Field>
      </div>

      {marketError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"><span>Market data unavailable. {marketError}</span><button type="button" onClick={onRetryMarketData} className="rounded bg-warning/20 px-2 py-1 font-medium text-warning">Retry</button></div>}
      {marketLoading && <div role="status" className="text-xs text-muted">Loading historical candles for {symbol}…</div>}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={runSelectedBacktest} disabled={running || !canRun} className="px-4 py-2 rounded-lg bg-primary text-black text-xs font-semibold disabled:opacity-50 flex items-center gap-2"><Play className="w-3.5 h-3.5" />{running ? 'Running…' : 'Run backtest'}</button>
        <span className="text-xs text-muted">Warmup: 60 bars · Holding period: 5 bars · No fees or slippage modeled</span>
      </div>
      {runError && <div role="alert" className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg p-3">{runError}</div>}

      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">{metrics.map((metric) => <div key={metric.label} className="bg-surface border border-border rounded-xl p-3"><div className="text-xs text-muted">{metric.label}</div><div className={`mt-2 text-base font-semibold ${metric.color}`}>{metric.value}</div></div>)}</div>

      <section className="bg-surface border border-border rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3"><h2 className="text-xs font-medium text-muted">Equity Curve</h2>{lastRun && <span className="text-xs text-muted">{lastRun.strategyId} · {lastRun.capital} capital · {lastRun.candleCount} candles</span>}</div>
        <div className="h-64 border border-border rounded-lg overflow-hidden bg-bg/70">
          {running ? <div className="h-full flex items-center justify-center text-xs text-muted"><RefreshCw className="w-4 h-4 animate-spin mr-2" />Running simulation</div> : equityPoints.length ? (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" aria-label="Equity curve line chart">
              <path d={`M ${equityPoints.join(' L ')}`} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary" />
            </svg>
          ) : <div className="h-full flex items-center justify-center text-xs text-muted">Run a backtest to render the equity curve.</div>}
        </div>
      </section>

      <section className="bg-surface border border-border rounded-xl p-4">
        <h2 className="text-xs font-medium text-muted mb-3">Trade History</h2>
        {result?.trades.length ? <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-muted border-b border-border"><th className="text-left py-2 pr-3">Entry</th><th className="text-left py-2 pr-3">Exit</th><th className="text-left py-2 pr-3">Side</th><th className="text-right py-2 pr-3">Entry Price</th><th className="text-right py-2 pr-3">Exit Price</th><th className="text-right py-2 pr-3">Size</th><th className="text-right py-2">P&L</th></tr></thead><tbody>{result.trades.slice().reverse().map((trade) => <tr key={`${trade.entryTime}-${trade.exitTime}`} className="border-b border-border/50"><td className="py-2 pr-3 whitespace-nowrap">{formatTime(trade.entryTime)}</td><td className="py-2 pr-3 whitespace-nowrap">{formatTime(trade.exitTime)}</td><td className={`py-2 pr-3 uppercase ${trade.side === 'buy' ? 'text-success' : 'text-danger'}`}>{trade.side}</td><td className="py-2 pr-3 text-right">{trade.entryPrice.toFixed(4)}</td><td className="py-2 pr-3 text-right">{trade.exitPrice.toFixed(4)}</td><td className="py-2 pr-3 text-right">{trade.size.toFixed(4)}</td><td className={`py-2 text-right ${trade.pnl >= 0 ? 'text-success' : 'text-danger'}`}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}</td></tr>)}</tbody></table></div> : <div className="text-xs text-muted text-center py-8">{result ? 'No eligible signals produced trades for this selection.' : 'No backtest results yet. Select parameters and run a simulation.'}</div>}
      </section>
    </div>
  );
}

function Field({ id, label, children }: { id?: string; label: string; children: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-xl p-4">{id ? <label htmlFor={id} className="block text-xs text-muted mb-1.5">{label}</label> : <div className="block text-xs text-muted mb-1.5">{label}</div>}{children}</div>;
}

function formatTime(time: number): string {
  return new Date(time * 1000).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}
