import { Brain, CheckCircle2, Database, Gauge, LockKeyhole, Sparkles } from 'lucide-react';

export default function AILearning() {
  return (
    <div className="page-frame space-y-6">
      <div className="page-heading"><div className="page-heading-copy"><div className="page-eyebrow"><Brain className="w-3.5 h-3.5" /> Model operations</div><h1>AI Learning Center</h1><p>Monitor model readiness, data lineage, and the evidence pipeline behind autonomous decisions.</p></div></div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3"><Gauge className="w-4 h-4 text-primary" /><h3 className="text-xs font-medium text-muted">Model Performance</h3></div>
          <div className="text-2xl font-semibold text-muted">Not connected</div><div className="text-[10px] text-muted mt-1">No model performance endpoint is configured; the local governance view remains available.</div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3"><Database className="w-4 h-4 text-success" /><h3 className="text-xs font-medium text-muted">Training Status</h3></div>
          <div className="flex items-center gap-2 text-xs">
            <CheckCircle2 className="w-4 h-4 text-muted" /><span className="text-text">Dataset status unavailable</span>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3"><Sparkles className="w-4 h-4 text-warning" /><h3 className="text-xs font-medium text-muted">Prediction Accuracy</h3></div>
          <div className="text-2xl font-bold text-muted">No labeled data</div><div className="text-[10px] text-muted mt-1">Accuracy will appear after a governed evaluation dataset is connected.</div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3"><LockKeyhole className="w-4 h-4 text-primary" /><h3 className="text-xs font-medium text-muted">Feature Governance</h3></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{['Market structure', 'Liquidity context', 'Volatility regime', 'Pattern evidence', 'Momentum indicators', 'Portfolio risk'].map((feature, index) => <div key={feature} className="bg-bg/50 border border-border/60 rounded-lg p-3"><div className="flex items-center justify-between text-xs"><span>{feature}</span><span className="text-muted">{index < 3 ? 'DECLARED' : 'NOT VERIFIED'}</span></div><div className="h-1 mt-3 bg-border"><div className="h-full bg-muted" style={{ width: `${90 - index * 7}%` }} /></div></div>)}</div>
      </div>
    </div>
  );
}
