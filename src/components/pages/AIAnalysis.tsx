import { Brain, TrendingUp, TrendingDown, Minus, Activity, BarChart3, Zap, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Signal, MLPrediction, Recommendation } from '../../lib/types';

interface Props {
  signals: Signal[];
  ml: MLPrediction | null;
  mlStatus: 'idle' | 'loading' | 'ready' | 'cached' | 'unavailable';
  recommendation: Recommendation | null;
  onRefreshML: () => void;
  mlLoading: boolean;
  candleCount: number;
  marketLoading: boolean;
  marketError: string | null;
}

export default function AIAnalysis({ signals, ml, mlStatus, recommendation, onRefreshML, mlLoading, candleCount, marketLoading, marketError }: Props) {
  const [signalFilter, setSignalFilter] = useState<'all' | 'buy' | 'sell' | 'neutral'>('all');
  const [selectedSignal, setSelectedSignal] = useState<string | null>(null);
  const filteredSignals = useMemo(() => signalFilter === 'all' ? signals : signals.filter((signal) => signal.side === signalFilter), [signalFilter, signals]);
  return (
    <div className="page-frame space-y-6">
      {marketError && <div role="alert" className="text-xs text-warning bg-warning/10 border border-warning/20 rounded-lg p-3">Market data unavailable: {marketError}. Pattern analysis may be stale.</div>}
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Brain className="w-4 h-4 text-primary" /> AI Analysis Panel
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* AI Confidence Gauge */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3"><h3 className="text-xs font-medium text-muted">AI Confidence Gauge</h3><button type="button" onClick={onRefreshML} disabled={mlLoading} aria-label="Refresh ML prediction" className="min-h-11 min-w-11 rounded-lg border border-border hover:bg-bg text-muted disabled:opacity-50" title="Refresh ML prediction"><RefreshCw className={`mx-auto h-4 w-4 ${mlLoading ? 'animate-spin' : ''}`} /></button></div>
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20">
              <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgb(var(--border))" strokeWidth="3" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgb(var(--primary))" strokeWidth="3" strokeDasharray={`${(ml?.probability ?? 0) * 100}, 100`} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold tabular-nums">{ml ? `${(ml.probability * 100).toFixed(0)}%` : '--'}</span>
              </div>
            </div>
            <div className="text-xs text-muted">
              {ml ? (
                <div className="space-y-1">
                  <div>Direction: <span className="text-text font-medium capitalize">{ml.prediction}</span></div>
                  <div>Calibrated move: <span className="text-text font-medium">{ml.expected_move_pct === null ? 'Not available' : `${ml.expected_move_pct >= 0 ? '+' : ''}${ml.expected_move_pct.toFixed(2)}%`}</span></div>
                  {ml.edge_status === 'no-edge' && <div className="text-warning">This model did not beat the momentum baseline on its held-out test.</div>}
                  <div>Confidence: <span className="text-text font-medium capitalize">{ml.confidence}</span></div>
                  {mlStatus === 'cached' && <div className="text-warning">Showing the last cached prediction; refresh is unavailable.</div>}
                </div>
              ) : mlStatus === 'loading' ? 'Loading ML prediction…' : mlStatus === 'unavailable' ? 'ML service unavailable. Local strategy evidence remains active.' : 'No ML prediction available'}
            </div>
          </div>
        </div>

        {/* Trend Strength Meter */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <h3 className="text-xs font-medium text-muted mb-3 flex items-center gap-1">
            <Activity className="w-3 h-3" /> Trend Strength
          </h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted">Strength</span>
                <span className="tabular-nums">{recommendation ? `${Math.abs(recommendation.score * 100).toFixed(0)}%` : '--'}</span>
              </div>
              <div className="h-2 bg-border rounded-full overflow-hidden">
                <div className={`h-full transition-all ${(recommendation?.score ?? 0) >= 0 ? 'bg-success' : 'bg-danger'}`}
                  style={{ width: `${Math.abs(recommendation?.score ?? 0) * 100}%` }} />
              </div>
            </div>
            <div className="text-xs text-muted">
              Signal score: {recommendation?.score.toFixed(3) ?? '--'}
            </div>
          </div>
        </div>

        {/* Pattern Detection Summary */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between gap-2 mb-3"><h3 className="text-xs font-medium text-muted flex items-center gap-1"><Zap className="w-3 h-3" /> Active Patterns</h3><span className="text-xs text-muted">{filteredSignals.length} shown</span></div>
          <div className="flex flex-wrap gap-1 mb-3" role="group" aria-label="Filter analysis signals">{(['all', 'buy', 'sell', 'neutral'] as const).map((filter) => <button key={filter} type="button" aria-pressed={signalFilter === filter} onClick={() => { setSignalFilter(filter); setSelectedSignal(null); }} className={`min-h-11 rounded px-3 text-xs capitalize ${signalFilter === filter ? 'bg-primary/15 text-primary' : 'bg-bg text-muted hover:text-text'}`}>{filter}</button>)}</div>
          <div className="space-y-2">
            {signals.length === 0 && <div className="text-xs text-muted">{marketLoading ? 'Loading market data…' : marketError ? 'Patterns cannot be evaluated until the market feed recovers.' : candleCount < 60 ? 'Waiting for enough candles to evaluate patterns.' : 'No patterns detected on the latest candle.'}</div>}
            {signals.length > 0 && filteredSignals.length === 0 && <div className="text-xs text-muted">No {signalFilter} signals in the current analysis.</div>}
            {filteredSignals.map((signal, index) => {
              const key = `${signal.strategyId ?? signal.strategy}:${signal.side}:${index}`;
              const expanded = selectedSignal === key;
              return <div key={key} className="rounded-lg bg-bg/50">
                <button type="button" aria-expanded={expanded} onClick={() => setSelectedSignal(expanded ? null : key)} className="flex min-h-11 w-full items-center gap-2 rounded-lg p-2 text-left text-xs hover:bg-bg">
                  <span className={`w-1.5 h-1.5 rounded-full ${signal.side === 'buy' ? 'bg-success' : signal.side === 'sell' ? 'bg-danger' : 'bg-muted'}`} />
                  <span className="text-muted flex-1 truncate">{signal.strategy}</span>
                  <span className="tabular-nums">{(signal.confidence * 100).toFixed(0)}%</span>
                  <span className="text-xs uppercase text-muted">{expanded ? 'Hide' : 'Details'}</span>
                </button>
                {expanded && <div className="border-t border-border/60 px-3 py-2 text-xs text-muted"><p>{signal.reason}</p><p className="mt-1">{signal.side.toUpperCase()} · confidence {(signal.confidence * 100).toFixed(1)}%{signal.strategyVersion ? ` · version ${signal.strategyVersion}` : ''}</p></div>}
              </div>;
            })}
          </div>
        </div>
      </div>

      {/* Market Structure Analysis */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <h3 className="text-xs font-medium text-muted mb-3 flex items-center gap-1">
          <BarChart3 className="w-3 h-3" /> Market Structure Analysis
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="bg-bg/50 rounded-lg p-3">
            <div className="text-muted mb-1">Market Phase</div>
            <div className="font-medium capitalize">{recommendation ? (Math.abs(recommendation.score) > 0.3 ? 'Trending' : 'Ranging') : '--'}</div>
          </div>
          <div className="bg-bg/50 rounded-lg p-3">
            <div className="text-muted mb-1">Momentum</div>
            <div className="font-medium flex items-center gap-1">
              {recommendation?.side === 'buy' ? <TrendingUp className="w-3 h-3 text-success" /> : recommendation?.side === 'sell' ? <TrendingDown className="w-3 h-3 text-danger" /> : <Minus className="w-3 h-3 text-muted" />}
              {recommendation?.side === 'buy' ? 'Bullish' : recommendation?.side === 'sell' ? 'Bearish' : 'Neutral'}
            </div>
          </div>
          <div className="bg-bg/50 rounded-lg p-3">
            <div className="text-muted mb-1">Volatility</div>
            <div className="font-medium">{recommendation?.atr ? `ATR ${recommendation.atr.toFixed(2)}` : '--'}</div>
          </div>
          <div className="bg-bg/50 rounded-lg p-3">
            <div className="text-muted mb-1">Signal Count</div>
            <div className="font-medium">{signals.length} active</div>
          </div>
        </div>
      </div>
    </div>
  );
}
