import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Shield, Target, DollarSign, Activity, RefreshCw } from 'lucide-react';
import { fetchPaperAccount, type PaperAccount } from '../../lib/backend-api';

const STARTING_BALANCE = 100_000;
const LIMITS = { dailyLoss: 0.05, maxDrawdown: 0.2, exposure: 0.5, riskReward: 1.5 };

export default function RiskManagement() {
  const [account, setAccount] = useState<PaperAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [balance, setBalance] = useState(100_000);
  const [riskPercent, setRiskPercent] = useState(1);
  const [entry, setEntry] = useState(100);
  const [stop, setStop] = useState(95);

  const load = async () => {
    setLoading(true);
    try {
      const nextAccount = await fetchPaperAccount();
      setAccount(nextAccount);
      const openPositions = nextAccount.positions.filter((position) => position.status === 'open');
      setBalance(nextAccount.cash + openPositions.reduce((sum, position) => sum + position.entryPrice * position.quantity, 0));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const metrics = useMemo(() => {
    const openPositions = account?.positions.filter((position) => position.status === 'open') ?? [];
    const trades = account?.trades ?? [];
    const exposure = openPositions.reduce((sum, position) => sum + position.entryPrice * position.quantity, 0);
    const equity = account ? account.cash + exposure : 0;
    const riskAtStop = openPositions.reduce((sum, position) => sum + (position.stopLoss == null ? 0 : Math.abs(position.entryPrice - position.stopLoss) * position.quantity), 0);
    const today = new Date().toISOString().slice(0, 10);
    const dailyPnl = trades.filter((trade) => trade.closedAt.startsWith(today)).reduce((sum, trade) => sum + trade.realizedPnl, 0);
    let peak = STARTING_BALANCE;
    let realizedEquity = STARTING_BALANCE;
    let maxDrawdown = 0;
    for (const trade of trades.slice().sort((a, b) => a.closedAt.localeCompare(b.closedAt))) {
      realizedEquity += trade.realizedPnl;
      peak = Math.max(peak, realizedEquity);
      maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - realizedEquity) / peak : 0);
    }
    return {
      exposureRatio: equity > 0 ? exposure / equity : 0,
      riskRatio: equity > 0 ? riskAtStop / equity : 0,
      dailyPnl,
      dailyLossRatio: equity > 0 ? Math.max(0, -dailyPnl / equity) : 0,
      maxDrawdown,
      openPositions,
    };
  }, [account]);

  const safeBalance = Number.isFinite(balance) && balance > 0 ? balance : 0;
  const safeRiskPercent = Number.isFinite(riskPercent) && riskPercent >= 0 ? Math.min(riskPercent, 2) : 0;
  const safeEntry = Number.isFinite(entry) && entry > 0 ? entry : 0;
  const safeStop = Number.isFinite(stop) && stop > 0 ? stop : 0;
  const riskAmount = safeBalance * (safeRiskPercent / 100);
  const stopDistance = Math.abs(safeEntry - safeStop);
  const positionSize = safeEntry > 0 && safeStop > 0 && stopDistance > 0 ? riskAmount / stopDistance : 0;
  const cards = [
    { label: 'Daily Realized P&L', value: account ? `${metrics.dailyPnl >= 0 ? '+' : ''}$${metrics.dailyPnl.toFixed(2)}` : '--', icon: DollarSign, color: metrics.dailyPnl < 0 ? 'text-danger' : 'text-success' },
    { label: 'Portfolio Exposure', value: account ? `${(metrics.exposureRatio * 100).toFixed(2)}%` : '--', icon: Activity, color: metrics.exposureRatio > LIMITS.exposure ? 'text-danger' : 'text-primary' },
    { label: 'Max Realized Drawdown', value: account?.trades.length ? `${(metrics.maxDrawdown * 100).toFixed(2)}%` : '--', icon: Target, color: metrics.maxDrawdown > LIMITS.maxDrawdown ? 'text-danger' : 'text-success' },
    { label: 'Open Risk at Stop', value: account ? `${(metrics.riskRatio * 100).toFixed(2)}%` : '--', icon: Shield, color: metrics.riskRatio > 0.02 ? 'text-warning' : 'text-primary' },
  ];

  return (
    <div className="page-frame space-y-6">
      <div className="page-heading"><div className="page-heading-copy"><div className="page-eyebrow"><AlertTriangle className="w-3.5 h-3.5" /> Account controls</div><h1>Risk Management</h1><p>Review paper-account exposure and calculate position size from your current equity.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="p-2 rounded-lg hover:bg-surface text-muted disabled:opacity-50" aria-label="Refresh risk metrics"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button></div>
      {error && <div role="alert" className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg p-3">Could not load account risk data. The position-size calculator remains available.</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{cards.map((card) => { const Icon = card.icon; return <div key={card.label} className="bg-surface border border-border rounded-xl p-4"><div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center"><Icon className={`w-4 h-4 ${card.color}`} /></div></div><div className="text-[10px] text-muted">{card.label}</div><div className={`text-lg font-semibold ${card.color}`}>{loading ? '…' : card.value}</div></div>; })}</div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-surface border border-border rounded-xl p-4"><h2 className="text-xs font-medium text-muted mb-3">Risk Limits</h2><div className="space-y-3">{[{ label: 'Max Daily Loss', value: `${(LIMITS.dailyLoss * 100).toFixed(0)}%` }, { label: 'Max Drawdown', value: `${(LIMITS.maxDrawdown * 100).toFixed(0)}%` }, { label: 'Max Portfolio Exposure', value: `${(LIMITS.exposure * 100).toFixed(0)}%` }, { label: 'Min Risk/Reward', value: `1:${LIMITS.riskReward}` }].map((limit) => <div key={limit.label} className="flex items-center justify-between text-xs"><span className="text-muted">{limit.label}</span><span className="font-medium tabular-nums text-text">{limit.value}</span></div>)}</div><p className="text-[10px] text-muted mt-3">These are the decision engine defaults; they are not editable from this page.</p></section>

        <section className="bg-surface border border-border rounded-xl p-4"><h2 className="text-xs font-medium text-muted mb-3">Position Sizing Calculator</h2><div className="space-y-3"><label className="block text-[10px] text-muted">Account Balance<input type="number" min="0" value={balance} onChange={(event) => setBalance(Number(event.target.value))} className="mt-1 w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-xs" /></label><label className="block text-[10px] text-muted">Risk % (max 2%)<input type="number" min="0" max="2" step="0.1" value={riskPercent} onChange={(event) => setRiskPercent(Number(event.target.value))} className="mt-1 w-full px-3 py-2 rounded-lg bg-bg border border-border text-text text-xs" /></label><div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-muted">Entry<input type="number" min="0" value={entry} onChange={(event) => setEntry(Number(event.target.value))} className="mt-1 w-full px-2 py-1.5 rounded bg-bg border border-border text-text text-xs" /></label><label className="text-[10px] text-muted">Stop<input type="number" min="0" value={stop} onChange={(event) => setStop(Number(event.target.value))} className="mt-1 w-full px-2 py-1.5 rounded bg-bg border border-border text-text text-xs" /></label></div><div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50"><div><div className="text-[10px] text-muted">Risk amount</div><div className="text-sm font-semibold text-warning">${riskAmount.toFixed(2)}</div></div><div><div className="text-[10px] text-muted">Position size</div><div className="text-sm font-semibold text-primary">{positionSize.toFixed(6)}</div></div></div>{safeEntry === safeStop && safeEntry > 0 && <div className="text-xs text-warning">Entry and stop must be different to calculate position size.</div>}</div></section>
      </div>

      <section className="bg-surface border border-border rounded-xl p-4"><h2 className="text-xs font-medium text-muted mb-3">Open Position Risk</h2>{metrics.openPositions.length ? <div className="space-y-2">{metrics.openPositions.map((position) => { const atRisk = position.stopLoss == null ? null : Math.abs(position.entryPrice - position.stopLoss) * position.quantity; return <div key={position.id} className="flex items-center justify-between gap-3 rounded-lg bg-bg/50 border border-border/60 p-3 text-xs"><span><strong>{position.symbol}</strong><span className="text-muted uppercase ml-2">{position.side}</span><span className="block text-[10px] text-muted mt-1">Entry {position.entryPrice.toFixed(4)} · Stop {position.stopLoss?.toFixed(4) ?? 'not set'}</span></span><span className="text-right"><strong>{atRisk == null ? 'Unprotected' : `$${atRisk.toFixed(2)}`}</strong><span className="block text-[10px] text-muted">estimated loss at stop</span></span></div>; })}</div> : loading ? <div className="text-xs text-muted">Loading positions…</div> : <div className="text-xs text-muted text-center py-8">No open positions to assess.</div>}</section>
    </div>
  );
}
