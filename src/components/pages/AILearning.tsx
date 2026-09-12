import { Brain } from 'lucide-react';

export default function AILearning() {
  return (
    <div className="p-4 lg:p-6 space-y-6">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Brain className="w-4 h-4 text-primary" /> AI Learning Center
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4">
          <h3 className="text-xs font-medium text-muted mb-3">Model Performance</h3>
          <div className="space-y-2">
            <div className="text-xs text-muted">No training data yet.</div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <h3 className="text-xs font-medium text-muted mb-3">Training Status</h3>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full bg-muted" />
            <span className="text-muted">Not training</span>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <h3 className="text-xs font-medium text-muted mb-3">Prediction Accuracy</h3>
          <div className="text-2xl font-bold text-muted">--</div>
          <div className="text-[10px] text-muted mt-1">Last 100 predictions</div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-4">
        <h3 className="text-xs font-medium text-muted mb-3">Feature Importance</h3>
        <div className="text-xs text-muted text-center py-8">Feature importance analysis will appear after model training.</div>
      </div>
    </div>
  );
}
