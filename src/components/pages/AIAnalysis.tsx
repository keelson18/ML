import { Brain, TrendingUp, TrendingDown, Minus, Activity, BarChart3, Target, Zap } from 'lucide-react';
import type { Signal, MLPrediction, Recommendation } from '../../lib/types';

interface Props {
  signals: Signal[];
  ml: MLPrediction | null;
  recommendation: Recommendation | null;
  onRefreshML: () => void;
  mlLoading: boolean;
}

export default function AIAnalysis({ signals, ml, recommendation, onRefreshML, mlLoading }: Props) {
  return (
    <div className="p-4 lg:p-6 space-y-6">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Brain className="w-4 h-4 text-primary" /> AI Analysis Panel
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* AI Confidence Gauge */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <h3 className="text-xs font-medium text-muted mb-3">AI Confidence Gauge</h3>
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20">
              <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgb(var(--border))" strokeWidth="3" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgb(var(--primary))" strokeWidth="3" strokeDasharray={`${(ml?.probability ?? 0.5) * 100}, 100`} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold tabular-nums">{ml ? `${(ml.probability * 100).toFixed(0)}%` : '--'}</span>
              </div>
            </div>
            <div className="text-xs text-muted">
              {ml ? (
                <div className="space-y-1">
                  <div>Direction: <span className="text-text font-medium capitalize">{ml.prediction}</span></div>
                  <div>Move: <span className="text-text font-medium">{ml.expected_move_pct >= 0 ? '+' : ''}{ml.expected_move_pct.toFixed(2)}%</span></div>
                  <div>Confidence: <span className="text-text font-medium capitalize">{ml.confidence}</span></div>
                </div>
              ) : 'No ML prediction available'}
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
          <h3 className="text-xs font-medium text-muted mb-3 flex items-center gap-1">
            <Zap className="w-3 h-3" /> Active Patterns
          </h3>
          <div className="space-y-2">
            {signals.length === 0 && <div className="text-xs text-muted">No patterns detected</div>}
            {signals.slice(0, 5).map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`w-1.5 h-1.5 rounded-full ${s.side === 'buy' ? 'bg-success' : s.side === 'sell' ? 'bg-danger' : 'bg-muted'}`} />
                <span className="text-muted flex-1 truncate">{s.strategy}</span>
                <span className="tabular-nums">{(s.confidence * 100).toFixed(0)}%</span>
              </div>
            ))}
            {signals.length > 5 && <div className="text-xs text-muted">+{signals.length - 5} more</div>}
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
