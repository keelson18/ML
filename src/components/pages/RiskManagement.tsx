import { AlertTriangle, Shield, Target, DollarSign, Activity } from 'lucide-react';

export default function RiskManagement() {
  return (
    <div className="p-4 lg:p-6 space-y-6">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-primary" /> Risk Management
      </h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-danger/15 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-danger" />
            </div>
          </div>
          <div className="text-[10px] text-muted">Daily Risk Used</div>
          <div className="text-lg font-semibold">0%</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <Activity className="w-4 h-4 text-primary" />
            </div>
          </div>
          <div className="text-[10px] text-muted">Portfolio Risk</div>
          <div className="text-lg font-semibold">0%</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-success/15 flex items-center justify-center">
              <Target className="w-4 h-4 text-success" />
            </div>
          </div>
          <div className="text-[10px] text-muted">Max Drawdown</div>
          <div className="text-lg font-semibold">0%</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-warning/15 flex items-center justify-center">
              <Shield className="w-4 h-4 text-warning" />
            </div>
          </div>
          <div className="text-[10px] text-muted">Position Risk</div>
          <div className="text-lg font-semibold">0%</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4">
          <h3 className="text-xs font-medium text-muted mb-3">Risk Limits</h3>
          <div className="space-y-3">
            {[
              { label: 'Max Daily Loss', value: '-5%', color: 'text-danger' },
              { label: 'Max Drawdown', value: '-20%', color: 'text-danger' },
              { label: 'Max Portfolio Exposure', value: '50%', color: 'text-warning' },
              { label: 'Min Risk/Reward', value: '1:1.5', color: 'text-success' },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between text-xs">
                <span className="text-muted">{r.label}</span>
                <span className={`font-medium tabular-nums ${r.color}`}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-4">
          <h3 className="text-xs font-medium text-muted mb-3">Position Sizing Calculator</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] text-muted mb-1">Account Balance</label>
              <input type="number" placeholder="10000" className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-xs focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-[10px] text-muted mb-1">Risk %</label>
              <input type="number" placeholder="1.0" className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="text-xs text-muted text-center py-2">Enter values to calculate position size</div>
          </div>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-4">
        <h3 className="text-xs font-medium text-muted mb-3">Asset Correlation Matrix</h3>
        <div className="text-xs text-muted text-center py-8">Correlation data will appear here when multiple positions are tracked.</div>
      </div>
    </div>
  );
}
