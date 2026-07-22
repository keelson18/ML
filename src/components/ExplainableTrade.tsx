import { Info, TrendingUp, TrendingDown, Shield, Target, AlertTriangle, BarChart3 } from 'lucide-react';
import type { Recommendation, Signal } from '../lib/types';

interface Props {
  recommendation: Recommendation;
  signals: Signal[];
  onClose?: () => void;
}

export default function ExplainableTrade({ recommendation, signals, onClose }: Props) {
  const isBullish = recommendation.side === 'buy';
  const isBearish = recommendation.side === 'sell';

  return (
    <div className="bg-surface border border-border rounded-xl p-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Info className="w-4 h-4 text-primary" />
          Explainable Trade
        </h3>
        {onClose && (
          <button onClick={onClose} className="text-muted hover:text-text text-xs">Close</button>
        )}
      </div>

      {/* 1. Why the trade was taken */}
      <Section icon={BarChart3} title="1. Market Condition Rationale" color="text-primary">
        <p className="text-sm">
          The recommendation is <strong className={isBullish ? 'text-success' : isBearish ? 'text-danger' : ''}>
          {recommendation.side.toUpperCase()}</strong> with a score of <strong>{(recommendation.score * 100).toFixed(1)}%</strong>.
        </p>
        <p className="text-xs text-muted mt-1">
          {recommendation.contributors.length} signals contributed to this decision.
        </p>
      </Section>

      {/* 2. Indicators involved */}
      <Section icon={TrendingUp} title="2. Indicators & Triggers" color="text-success">
        <div className="space-y-1.5">
          {signals.map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-xs py-0.5">
              <span className={`font-medium ${s.side === 'buy' ? 'text-success' : s.side === 'sell' ? 'text-danger' : 'text-muted'}`}>
                {s.strategy}:
              </span>
              <span className="text-muted">{s.reason}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* 3. Confidence score breakdown */}
      <Section icon={BarChart3} title="3. Confidence Score" color="text-warning">
        <div className="space-y-2">
          {recommendation.contributors.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className="w-24 truncate text-muted">{c.source}</div>
              <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${c.side === 'buy' ? 'bg-success' : c.side === 'sell' ? 'bg-danger' : 'bg-muted'}`}
                  style={{ width: `${c.confidence * 100}%` }}
                />
              </div>
              <span className="tabular-nums w-10 text-right">{(c.confidence * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </Section>

      {/* 4. Risk assessment */}
      <Section icon={Shield} title="4. Risk Assessment" color="text-danger">
        <div className="grid grid-cols-2 gap-2 text-xs">
          {recommendation.atr && (
            <>
              <div className="bg-bg/50 rounded p-2">
                <div className="text-muted mb-0.5">ATR (14)</div>
                <div className="font-medium tabular-nums">{recommendation.atr.toFixed(2)}</div>
              </div>
              <div className="bg-bg/50 rounded p-2">
                <div className="text-muted mb-0.5">Volatility</div>
                <div className="font-medium">{recommendation.atr > 0 ? 'Moderate' : 'Low'}</div>
              </div>
            </>
          )}
        </div>
      </Section>

      {/* 5. Stop Loss reasoning */}
      {recommendation.stopLoss && recommendation.entry && (
        <Section icon={Shield} title="5. Stop Loss Reasoning" color="text-danger">
          <p className="text-xs">
            SL placed at <strong className="text-danger">${recommendation.stopLoss.toFixed(2)}</strong>
            {' '}({(Math.abs(recommendation.stopLoss - recommendation.entry) / recommendation.entry * 100).toFixed(2)}% from entry).
            Based on <strong>1.5× ATR</strong> below entry, providing room for market noise while limiting downside.
          </p>
        </Section>
      )}

      {/* 6. Take Profit reasoning */}
      {recommendation.takeProfit && recommendation.entry && (
        <Section icon={Target} title="6. Take Profit Reasoning" color="text-success">
          <p className="text-xs">
            TP set at <strong className="text-success">${recommendation.takeProfit.toFixed(2)}</strong>
            {' '}({(Math.abs(recommendation.takeProfit - recommendation.entry) / recommendation.entry * 100).toFixed(2)}% from entry).
            Risk:Reward ratio of <strong>1:3</strong>.
          </p>
        </Section>
      )}

      {/* 7. Alternative scenarios */}
      <Section icon={AlertTriangle} title="7. Alternative Scenarios" color="text-warning">
        <ul className="text-xs text-muted space-y-1 list-disc pl-4">
          <li><strong>Invalidation:</strong> Price closes {isBullish ? 'below' : 'above'} stop loss level</li>
          <li><strong>Partial:</strong> Scale out 50% at 1:1.5 R:R, let rest run</li>
          <li><strong>Add-on:</strong> If price continues favorably, add on pullback to key moving average</li>
        </ul>
      </Section>
    </div>
  );
}

function Section({ icon: Icon, title, color, children }: { icon: any; title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 pb-4 border-b border-border/50 last:border-b-0 last:mb-0 last:pb-0">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <h4 className="text-xs font-semibold">{title}</h4>
      </div>
      {children}
    </div>
  );
}

