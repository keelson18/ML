import { Zap, TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';
import type { Signal, Candle, Timeframe } from '../../lib/types';

interface Props {
  signals: Signal[];
  candles: Candle[];
  timeframe: Timeframe;
}

const STRATEGY_TYPES = [
  { name: 'Trend Following', type: 'trend', desc: 'Follow established trends with MA crossovers and ADX confirmation', icon: TrendingUp },
  { name: 'Momentum', type: 'momentum', desc: 'Capture strong directional moves with RSI and MACD momentum', icon: Zap },
  { name: 'Mean Reversion', type: 'contrarian', desc: 'Trade pullbacks to oversold/overbought levels', icon: TrendingDown },
  { name: 'Breakout', type: 'breakout', desc: 'Enter on volatility expansions and Bollinger squeezes', icon: Activity },
];

export default function StrategyLab({ signals, candles: _candles, timeframe: _timeframe }: Props) {
  // Group signals by strategy name
  const strategySignals = new Map<string, Signal[]>();
  for (const sig of signals) {
    const existing = strategySignals.get(sig.strategy) ?? [];
    existing.push(sig);
    strategySignals.set(sig.strategy, existing);
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Zap className="w-4 h-4 text-primary" /> Strategy Lab
      </h2>

      {/* Strategy Library */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {STRATEGY_TYPES.map((st) => {
          const Icon = st.icon;
          const matchingSignals = strategySignals.get(st.name.split(' ')[0]) ?? [];
          const activeSigs = matchingSignals.filter((s) => s.side !== 'neutral');
          return (
            <div key={st.name} className="bg-surface border border-border rounded-xl p-4 hover:border-primary/30 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-medium">{st.name}</div>
                  <div className="text-[10px] text-muted capitalize">{st.type}</div>
                </div>
              </div>
              <p className="text-xs text-muted mb-3">{st.desc}</p>
              {activeSigs.length > 0 ? (
                <div className="space-y-1">
                  {activeSigs.slice(0, 3).map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={`w-2 h-2 rounded-full ${s.side === 'buy' ? 'bg-success' : 'bg-danger'}`} />
                      <span className="flex-1 truncate text-muted">{s.reason}</span>
                      <span className="tabular-nums">{(s.confidence * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted">No active signals</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
