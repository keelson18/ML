import { useState } from 'react';
import { AlertTriangle, Shield, Target, DollarSign, Activity } from 'lucide-react';

export default function RiskManagement() {
  const [balance, setBalance] = useState(10000);
  const [riskPercent, setRiskPercent] = useState(1);
  const [entry, setEntry] = useState(100);
  const [stop, setStop] = useState(95);
  const safeBalance = Number.isFinite(balance) && balance > 0 ? balance : 0;
  const safeRiskPercent = Number.isFinite(riskPercent) && riskPercent >= 0 ? Math.min(riskPercent, 2) : 0;
  const safeEntry = Number.isFinite(entry) && entry > 0 ? entry : 0;
  const safeStop = Number.isFinite(stop) && stop > 0 ? stop : 0;
  const riskAmount = safeBalance * (safeRiskPercent / 100);
  const stopDistance = Math.abs(safeEntry - safeStop);
  const positionSize = safeEntry > 0 && safeStop > 0 && stopDistance > 0 ? riskAmount / stopDistance : 0;
  return (
    <div className="page-frame space-y-6">
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
          <div className="text-lg font-semibold text-muted">--</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <Activity className="w-4 h-4 text-primary" />
            </div>
          </div>
          <div className="text-[10px] text-muted">Portfolio Risk</div>
          <div className="text-lg font-semibold text-muted">--</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-success/15 flex items-center justify-center">
              <Target className="w-4 h-4 text-success" />
            </div>
          </div>
          <div className="text-[10px] text-muted">Max Drawdown</div>
          <div className="text-lg font-semibold text-muted">--</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-warning/15 flex items-center justify-center">
              <Shield className="w-4 h-4 text-warning" />
            </div>
          </div>
          <div className="text-[10px] text-muted">Position Risk</div>
          <div className="text-lg font-semibold text-muted">--</div>
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
              <input type="number" value={balance} onChange={(event) => setBalance(Number(event.target.value))} className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-xs focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-[10px] text-muted mb-1">Risk %</label>
              <input type="number" min="0" max="2" step="0.1" value={riskPercent} onChange={(event) => setRiskPercent(Number(event.target.value))} className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-xs focus:outline-none focus:border-primary" />
            </div>
            <div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-muted">Entry<input type="number" value={entry} onChange={(event) => setEntry(Number(event.target.value))} className="mt-1 w-full px-2 py-1.5 rounded bg-bg border border-border text-text text-xs" /></label><label className="text-[10px] text-muted">Stop<input type="number" value={stop} onChange={(event) => setStop(Number(event.target.value))} className="mt-1 w-full px-2 py-1.5 rounded bg-bg border border-border text-text text-xs" /></label></div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50"><div><div className="text-[10px] text-muted">Risk amount</div><div className="text-sm font-semibold text-warning">${riskAmount.toFixed(2)}</div></div><div><div className="text-[10px] text-muted">Position size</div><div className="text-sm font-semibold text-primary">{positionSize.toFixed(4)}</div></div></div>{safeEntry === safeStop && safeEntry > 0 && <div className="text-xs text-warning">Entry and stop must be different to calculate position size.</div>}
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
