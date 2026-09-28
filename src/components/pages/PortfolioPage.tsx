import { useEffect, useState } from 'react';
import { Briefcase, TrendingUp, DollarSign, Activity, RefreshCw } from 'lucide-react';
import { fetchPaperAccount, type PaperAccount } from '../../lib/backend-api';

export default function PortfolioPage() {
  const [account, setAccount] = useState<PaperAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = () => {
    setLoading(true);
    fetchPaperAccount().then((next) => { setAccount(next); setError(false); }).catch(() => setError(true)).finally(() => setLoading(false));
  };
  useEffect(() => { refresh(); const timer = window.setInterval(refresh, 15_000); return () => window.clearInterval(timer); }, []);

  const trades = account?.trades ?? [];
  const wins = trades.filter((trade) => trade.realizedPnl > 0).length;
  const realizedPnl = trades.reduce((sum, trade) => sum + trade.realizedPnl, 0);
  const stats = [
    { label: 'Paper Equity (entry marked)', value: account ? `$${(account.cash + account.positions.filter((p) => p.status === 'open').reduce((sum, p) => sum + p.entryPrice * p.quantity, 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '--', icon: DollarSign, color: 'text-primary' },
    { label: 'Realized P&L', value: account ? `${realizedPnl >= 0 ? '+' : ''}$${realizedPnl.toFixed(2)}` : '--', icon: TrendingUp, color: realizedPnl >= 0 ? 'text-success' : 'text-danger' },
    { label: 'Open Positions', value: account ? String(account.positions.filter((p) => p.status === 'open').length) : '--', icon: Briefcase, color: 'text-text' },
    { label: 'Win Rate', value: trades.length ? `${((wins / trades.length) * 100).toFixed(0)}%` : '--', icon: Activity, color: 'text-text' },
  ];

  return (
    <div className="page-frame space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Briefcase className="w-4 h-4 text-primary" /> Portfolio</h2>
        <button onClick={refresh} className="p-2 rounded-lg hover:bg-surface text-muted" title="Refresh paper account" aria-label="Refresh paper account"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
      {error && <div className="text-xs text-warning bg-warning/10 border border-warning/20 rounded-lg p-3">Backend account unavailable. Start the backend to view live paper positions.</div>}
      {account && <div className="text-xs text-muted">Open positions are valued at entry price because no quote service is connected to the paper account endpoint.</div>}

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
        {account?.positions.filter((p) => p.status === 'open').length ? <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-muted border-b border-border"><th className="text-left py-2">Symbol</th><th className="text-left py-2">Side</th><th className="text-right py-2">Qty</th><th className="text-right py-2">Entry</th><th className="text-right py-2">Stop / Target</th></tr></thead><tbody>{account.positions.filter((p) => p.status === 'open').map((position) => <tr key={position.id} className="border-b border-border/50"><td className="py-2 font-medium">{position.symbol}</td><td className={`py-2 uppercase ${position.side === 'buy' ? 'text-success' : 'text-danger'}`}>{position.side}</td><td className="py-2 text-right">{position.quantity}</td><td className="py-2 text-right">{position.entryPrice.toFixed(2)}</td><td className="py-2 text-right text-muted">{position.stopLoss?.toFixed(2) ?? '--'} / {position.takeProfit?.toFixed(2) ?? '--'}</td></tr>)}</tbody></table></div> : <div className="text-xs text-muted text-center py-8">No open positions. The autonomous engine will display fills here.</div>}
      </div>

      <div className="bg-surface border border-border rounded-xl p-4">
        <h3 className="text-xs font-medium text-muted mb-3">Trade History</h3>
        {trades.length ? <div className="space-y-2">{trades.slice().reverse().map((trade) => <div key={trade.id} className="flex items-center justify-between text-xs border-b border-border/50 pb-2"><span className="font-medium">{trade.symbol} <span className="text-muted uppercase">{trade.side}</span></span><span className={trade.realizedPnl >= 0 ? 'text-success' : 'text-danger'}>{trade.realizedPnl >= 0 ? '+' : ''}${trade.realizedPnl.toFixed(2)}</span></div>)}</div> : <div className="text-xs text-muted text-center py-8">No completed paper trades yet.</div>}
      </div>
    </div>
  );
}
