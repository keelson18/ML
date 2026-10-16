import { useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, History, Play, RefreshCw } from 'lucide-react';
import type { Candle, Timeframe } from '../../lib/types';
import { getMarket } from '../../lib/markets';
import { api } from '../../api';

interface Props {
  candles: Candle[];
  timeframe: Timeframe;
  symbol: string;
  theme: 'light' | 'dark';
  marketLoading: boolean;
  marketError: string | null;
  onRetryMarketData: () => void;
}

interface ResearchMetrics {
  barsProcessed: number;
  tradeCount: number;
  expectancyR: number | null;
  profitFactor: number | null;
  maxDrawdownR: number;
  netR: number;
  testDays: number;
}

interface ResearchValidation {
  passed: boolean;
  promotionEligible: boolean;
  reasons: string[];
}

type ResearchResponse =
  | { state: 'collecting'; testStartTime?: number; initialized?: boolean; newCandles?: number; collectedDays?: number; collectedBars?: number; requiredDays?: number; requiredBars?: number; requiredTrades?: number; tradeThresholdMet?: boolean; message?: string }
  | { runId: string; runVersion: string; datasetId: string; metrics: ResearchMetrics; validation: ResearchValidation; persisted?: boolean };

const FEE_RATE = 0.001;
const SLIPPAGE_RATE = 0.0005;

function localDateTimeValue(offsetMinutes: number): string {
  const date = new Date(Date.now() + offsetMinutes * 60_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function isCollecting(result: ResearchResponse | null): result is Extract<ResearchResponse, { state: 'collecting' }> {
  return result !== null && 'state' in result && result.state === 'collecting';
}

export default function BacktestingCenter({ candles, timeframe, symbol, marketLoading, marketError, onRetryMarketData }: Props) {
  const [name, setName] = useState('Forward paper-planner validation');
  const [hypothesis, setHypothesis] = useState('The versioned paper planner produces positive net expectancy after configured fees and slippage on the untouched forward period.');
  const [testStart, setTestStart] = useState(() => localDateTimeValue(10));
  const [experimentId, setExperimentId] = useState<string | null>(null);
  const [result, setResult] = useState<ResearchResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const market = getMarket(symbol);
  const supportedMarket = market?.isActive && market.marketType === 'crypto'
    && (market.priceCurrency ?? market.quoteAsset) === 'USD';

  const run = async () => {
    if (!name.trim() || !hypothesis.trim()) {
      setError('Enter an experiment name and a falsifiable hypothesis.');
      return;
    }
    if (!supportedMarket) {
      setError('Forward research currently supports active USD crypto markets only. This market has no verified continuous-session research workflow.');
      return;
    }
    const testStartTime = Math.floor(new Date(testStart).getTime() / 1000);
    if (!Number.isFinite(testStartTime) || testStartTime <= Date.now() / 1000 + 300) {
      setError('Choose a holdout start at least five minutes in the future.');
      return;
    }

    setRunning(true);
    setError(null);
    try {
      let id = experimentId;
      if (!id) {
        const registration = await api.post<{ id: string }>('/api/v1/research/experiments', {
          name: name.trim(),
          hypothesis: hypothesis.trim(),
          datasetId: `pending-forward-collection:${symbol}:15m:${testStartTime}`,
          parameters: { setupType: 'trend-pullback', testStartTime, transactionCostRate: FEE_RATE, slippageRate: SLIPPAGE_RATE },
        });
        id = registration.id;
        setExperimentId(id);
      }
      const response = await api.post<ResearchResponse>(`/api/v1/research/experiments/${id}/run`, {
        symbol,
        timeframe: '15m',
        historyLimit: 1000,
      });
      setResult(response);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The server research run could not be completed.');
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    setExperimentId(null);
    setResult(null);
    setError(null);
    setTestStart(localDateTimeValue(10));
  };

  const collecting = isCollecting(result);
  const completed = result && !collecting ? result : null;

  return (
    <div className="page-frame space-y-6">
      <div className="page-heading">
        <div className="page-heading-copy">
          <div className="page-eyebrow"><History className="w-3.5 h-3.5" /> Research workspace</div>
          <h1>Backtesting Center</h1>
          <p>Register a forward experiment against the canonical paper planner. The server collects provider candles and evaluates a fixed, untouched holdout.</p>
        </div>
      </div>

      <div role="note" className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
        This is a prospective validation, not an instant historical backtest. The server uses the trend-pullback paper planner on 15-minute candles, with its higher-timeframe context and fixed 0.10% fee / 0.05% slippage assumptions. A result is withheld until at least 90 forward days and 100 trades are collected. It does not enable autonomous entries or promote a strategy.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Field id="research-name" label="Experiment name">
          <input id="research-name" className="control-input" value={name} disabled={Boolean(experimentId) || running} onChange={(event) => setName(event.target.value)} maxLength={160} />
        </Field>
        <Field id="research-symbol" label="Market">
          <div id="research-symbol" className="control-readonly">{symbol} <span className="text-muted">· canonical timeframe 15m (chart: {timeframe})</span></div>
        </Field>
        <Field id="research-hypothesis" label="Falsifiable hypothesis">
          <textarea id="research-hypothesis" className="control-input min-h-28" value={hypothesis} disabled={Boolean(experimentId) || running} onChange={(event) => setHypothesis(event.target.value)} maxLength={2000} />
        </Field>
        <Field id="research-start" label="Untouched holdout start">
          <input id="research-start" type="datetime-local" className="control-input" value={testStart} disabled={Boolean(experimentId) || running} onChange={(event) => setTestStart(event.target.value)} />
          <p className="mt-2 text-xs text-muted">No candles after this time are used until the holdout starts. Registration fixes the boundary and costs.</p>
        </Field>
      </div>

      {marketError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"><span>Chart feed status: {marketError}</span><button type="button" onClick={onRetryMarketData} className="min-h-[var(--tap)] rounded border border-warning/40 px-3 font-medium hover:bg-warning/10">Retry feed</button></div>}
      {marketLoading && <div role="status" className="text-sm text-muted">Chart data loading for {symbol}. The research API obtains its own provider snapshots.</div>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={run} disabled={running || !symbol || !supportedMarket} className="min-h-[var(--tap)] rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-black disabled:opacity-50 flex items-center gap-2">
          {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : collecting ? <RefreshCw className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {running ? 'Checking provider evidence…' : collecting ? 'Check collection progress' : experimentId ? 'Resume research run' : 'Register and start collection'}
        </button>
        {experimentId && <button type="button" onClick={reset} disabled={running} className="min-h-[var(--tap)] rounded-lg border border-border px-4 py-2 text-sm">Start a new experiment</button>}
        {experimentId && <span className="text-xs text-muted">Experiment ID: {experimentId}</span>}
      </div>
      {!supportedMarket && <div role="note" className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">Forward research currently supports active USD crypto markets only. Choose a supported crypto symbol to register a holdout.</div>}
      {error && <div role="alert" className="flex items-start gap-2 text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg p-3"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}

      {collecting && <section role="status" className="bg-surface border border-border rounded-xl p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Clock3 className="w-4 h-4 text-warning" /> Forward evidence is collecting</h2>
        <p className="mt-2 text-sm text-muted">No performance estimate is shown yet. Recheck this experiment later; the server appends closed provider candles and preserves the registered holdout boundary.</p>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Collected days" value={`${(result.collectedDays ?? 0).toFixed(1)} / ${result.requiredDays ?? 90}`} />
          <Metric label="Holdout candles" value={`${result.collectedBars ?? 0}${result.requiredBars ? ` / ${result.requiredBars}` : ''}`} />
          <Metric label="New candles this check" value={String(result.newCandles ?? 0)} />
          <Metric label="Trade threshold" value={result.tradeThresholdMet ? 'Met' : `${result.requiredTrades ?? 100} required`} />
        </div>
        {result.message && <p className="mt-3 text-sm text-muted">{result.message}</p>}
      </section>}

      {completed && <section className="bg-surface border border-border rounded-xl p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold"><CheckCircle2 className="w-4 h-4 text-primary" /> Immutable server replay</h2>
        <p className="mt-1 text-xs text-muted">Run {completed.runId} · {completed.persisted ? 'Previously persisted run' : 'Newly persisted run'} · dataset {completed.datasetId}</p>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Net expectancy" value={formatR(completed.metrics.expectancyR)} />
          <Metric label="Net R" value={formatR(completed.metrics.netR)} />
          <Metric label="Max drawdown" value={`${completed.metrics.maxDrawdownR.toFixed(2)}R`} />
          <Metric label="Trades / test days" value={`${completed.metrics.tradeCount} / ${completed.metrics.testDays.toFixed(1)}`} />
          <Metric label="Profit factor" value={completed.metrics.profitFactor?.toFixed(2) ?? 'n/a'} />
          <Metric label="Bars processed" value={String(completed.metrics.barsProcessed)} />
        </div>
        <div className={`mt-4 rounded-lg border p-3 text-sm ${completed.validation.passed ? 'border-success/30 bg-success/10 text-success' : 'border-warning/30 bg-warning/10 text-warning'}`}>
          {completed.validation.passed ? 'Evidence gates passed.' : 'Evidence gates not passed.'} {completed.validation.promotionEligible ? 'Eligible for separate review.' : 'Not eligible for promotion.'}
          {completed.validation.reasons.length > 0 && <ul className="mt-2 list-disc pl-5">{completed.validation.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
        </div>
      </section>}

      {!result && <p className="text-sm text-muted">{candles.length} chart candles currently loaded. They are for chart display only; the server independently fetches and snapshots the research dataset.</p>}
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-xl p-4"><label htmlFor={id} className="block text-sm text-muted mb-1.5">{label}</label>{children}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-background border border-border p-3"><div className="text-xs text-muted">{label}</div><div className="mt-1 text-lg font-semibold tabular-nums">{value}</div></div>;
}

function formatR(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}R`;
}
