import { Briefcase, TrendingUp, DollarSign, Activity } from 'lucide-react';

export default function PortfolioPage() {
  const stats = [
    { label: 'Portfolio Value', value: '$10,000.00', icon: DollarSign, color: 'text-primary' },
    { label: 'Daily P&L', value: '$0.00 (0.00%)', icon: TrendingUp, color: 'text-success' },
    { label: 'Open Positions', value: '0', icon: Briefcase, color: 'text-text' },
    { label: 'Win Rate', value: '--', icon: Activity, color: 'text-text' },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Briefcase className="w-4 h-4 text-primary" /> Portfolio
      </h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-surface border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                  <Icon className={`w-4 h-4 ${s.color}`} />
                </div>
              </div>
              <div className="text-xs text-muted">{s.label}</div>
              <div className={`text-lg font-semibold tabular-nums ${s.color}`}>{s.value}</div>
            </div>
          );
        })}
      </div>

      <div className="bg-surface border border-border rounded-xl p-4">
        <h3 className="text-xs font-medium text-muted mb-3">Open Positions</h3>
        <div className="text-xs text-muted text-center py-8">No open positions. Start trading to see your positions here.</div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-4">
        <h3 className="text-xs font-medium text-muted mb-3">Trade History</h3>
        <div className="text-xs text-muted text-center py-8">No trade history yet.</div>
      </div>
    </div>
  );
}
