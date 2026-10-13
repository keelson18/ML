import { Activity, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { useMemo } from 'react';
import type { Candle, Signal, Timeframe } from '../../lib/types';
import { getStrategyAvailability, runAllLibraryStrategiesWithDiagnostics, STRATEGY_CATEGORIES } from '../../lib/strategies/index';

interface Props {
  signals: Signal[];
  candles: Candle[];
  timeframe: Timeframe;
}

const ICONS = {
  trend: TrendingUp,
  momentum: Zap,
  contrarian: TrendingDown,
  neutral: Activity,
  breakout: TrendingUp,
  volatility: Activity,
  institutional: Activity,
  adaptive: Zap,
} as const;

export default function StrategyLab({ signals, candles, timeframe }: Props) {
  const availability = useMemo(() => getStrategyAvailability(candles, timeframe), [candles, timeframe]);
  const library = useMemo(() => runAllLibraryStrategiesWithDiagnostics(candles, timeframe), [candles, timeframe]);
  const librarySignals = library.signals;
  const signalsById = new Map<string, Signal[]>();
  for (const signal of librarySignals) {
    if (!signal.strategyId) continue;
    const matching = signalsById.get(signal.strategyId) ?? [];
    matching.push(signal);
    signalsById.set(signal.strategyId, matching);
  }

  return (
    <div className="page-frame space-y-6">
      <div className="page-heading">
        <div className="page-heading-copy">
          <div className="page-eyebrow"><Zap className="w-3.5 h-3.5" /> Research workspace</div>
          <h1>Strategy Library</h1>
          <p>Browse executable rule definitions and current triggers from the active {timeframe} candle set. Signals show rule conditions, not calibrated probabilities or performance. Pattern detections remain evidence, not executable strategies.</p>
          <p className="mt-2 text-xs text-warning">Diagnostics use boundary-closed candles. This browser view does not verify provider provenance or feed freshness and cannot authorize an entry.</p>
        </div>
        <div className="text-xs text-muted">{candles.length} candles loaded</div>
      </div>

      <div className="space-y-6">
        {library.failures.length > 0 && <div role="alert" className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          {library.failures.length} strategy detector(s) failed; their outputs are unavailable and cannot be treated as evidence.
          <ul className="mt-2 list-inside list-disc">{library.failures.map((failure) => <li key={failure.strategyId}>{failure.strategy} ({failure.strategyId}): {failure.message}</li>)}</ul>
        </div>}
        {STRATEGY_CATEGORIES.map((category) => {
          const categoryStrategies = availability.filter(({ strategy }) => strategy.category === category);
          if (!categoryStrategies.length) return null;
          return (
            <section key={category} className="space-y-3">
              <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">{category}</h2><span className="text-[10px] text-muted">{categoryStrategies.length} strategies</span></div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {categoryStrategies.map(({ strategy, eligible, reason }) => {
                  const Icon = ICONS[strategy.type];
                  const activeSignals = (signalsById.get(strategy.id) ?? []).filter((signal) => signal.side !== 'neutral');
                  return (
                    <article key={strategy.id} className="bg-surface border border-border rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-primary" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium">{strategy.name}</div>
                            <span className={`text-[10px] font-medium ${eligible ? 'text-success' : 'text-muted'}`}>{eligible ? 'READY' : 'UNAVAILABLE'}</span>
                          </div>
                          <div className="text-[10px] text-muted mt-1">{strategy.type} · v{strategy.version} · min {strategy.minCandles} candles{strategy.requiresVolume ? ' · volume required' : ''}</div>
                        </div>
                      </div>
                      <p className="text-xs text-muted mt-3 mb-3">{strategy.description}</p>
                      {activeSignals.length > 0 ? (
                        <div className="space-y-1">
                          {activeSignals.slice(0, 3).map((signal, index) => <div key={`${signal.strategyId}-${index}`} className="flex items-center gap-2 text-xs"><span className={`w-2 h-2 rounded-full ${signal.side === 'buy' ? 'bg-success' : 'bg-danger'}`} /><span className="flex-1 truncate text-muted">{signal.reason}</span><span className="uppercase text-[10px]">{signal.side}</span></div>)}
                        </div>
                      ) : <div className="text-xs text-muted">{eligible ? 'No active signal on the latest candle.' : reason}</div>}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="bg-surface border border-border rounded-xl p-4">
        <h2 className="text-xs font-medium text-muted mb-3">Evidence sources</h2>
        <div className="flex flex-wrap gap-2 text-xs text-muted">{signals.filter((signal) => !signal.strategyId).map((signal, index) => <span key={`${signal.strategy}-${index}`} className="px-2 py-1 rounded bg-bg border border-border">{signal.strategy}</span>)}</div>
        {!signals.some((signal) => !signal.strategyId) && <div className="text-xs text-muted">No pattern evidence detected on the active candle set.</div>}
      </div>
    </div>
  );
}
