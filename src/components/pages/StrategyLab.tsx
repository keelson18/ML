import { Activity, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import type { Candle, Signal, Timeframe } from '../../lib/types';
import { getStrategyAvailability } from '../../lib/strategies/index';

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
  const availability = getStrategyAvailability(candles, timeframe);
  const signalsById = new Map<string, Signal[]>();
  for (const signal of signals) {
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
          <h1>Strategy Lab</h1>
          <p>Compare executable strategies against the active {timeframe} candle set. Pattern detections remain evidence, not executable strategy definitions.</p>
        </div>
        <div className="text-xs text-muted">{candles.length} candles loaded</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {availability.map(({ strategy, eligible, reason }) => {
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
                  <div className="text-[10px] text-muted mt-1">{strategy.type} · v{strategy.version} · min {strategy.minCandles} candles</div>
                </div>
              </div>
              <p className="text-xs text-muted mt-3 mb-3">{strategy.description}</p>
              <div className="flex flex-wrap gap-1 mb-3">
                {strategy.timeframes.map((supportedTimeframe) => <span key={supportedTimeframe} className={`px-1.5 py-0.5 rounded text-[10px] ${supportedTimeframe === timeframe ? 'bg-primary/15 text-primary' : 'bg-bg text-muted'}`}>{supportedTimeframe}</span>)}
              </div>
              {activeSignals.length > 0 ? (
                <div className="space-y-1">
                  {activeSignals.slice(0, 3).map((signal, index) => <div key={`${signal.strategyId}-${index}`} className="flex items-center gap-2 text-xs"><span className={`w-2 h-2 rounded-full ${signal.side === 'buy' ? 'bg-success' : 'bg-danger'}`} /><span className="flex-1 truncate text-muted">{signal.reason}</span><span className="tabular-nums">{(signal.confidence * 100).toFixed(0)}%</span></div>)}
                </div>
              ) : <div className="text-xs text-muted">{eligible ? 'No active signal on the latest candle.' : reason}</div>}
            </article>
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
