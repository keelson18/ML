import { useCallback, useEffect, useState } from 'react';
import { Briefcase, TrendingUp, DollarSign, Activity, RefreshCw, X } from 'lucide-react';
import { closePaperPosition, fetchPaperAccount, type PaperAccount } from '../../lib/backend-api';
import { getDataProvider } from '../../lib/providers';

export default function PortfolioPage() {
  const [account, setAccount] = useState<PaperAccount | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closingSymbol, setClosingSymbol] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setAccount(await fetchPaperAccount());
      setError(null);
    } catch {
      setError('Unable to load your paper account. Please try refreshing.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const openPositions = account?.positions.filter((position) => position.status === 'open') ?? [];
  const symbolKey = [...new Set(openPositions.map((position) => position.symbol))].join('|');

  useEffect(() => {
    let cancelled = false;
    const symbols = symbolKey ? symbolKey.split('|') : [];
    if (!symbols.length) {
      setPrices({});
      return;
    }
    const loadPrices = async () => {
      const entries = await Promise.all(symbols.map(async (symbol) => {
        try {
          const candles = await getDataProvider(symbol).fetchKlines(symbol, '1m', 1);
          const price = candles.at(-1)?.close;
          return price && Number.isFinite(price) ? [symbol, price] as const : null;
        } catch {
          return null;
        }
      }));
      if (!cancelled) setPrices(Object.fromEntries(entries.filter((entry): entry is [string, number] => entry !== null)));
    };
    void loadPrices();
    const timer = window.setInterval(() => void loadPrices(), 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [symbolKey]);

  const trades = account?.trades ?? [];
  const wins = trades.filter((trade) => trade.realizedPnl > 0).length;
  const realizedPnl = trades.reduce((sum, trade) => sum + trade.realizedPnl, 0);
  const today = new Date().toISOString().slice(0, 10);
  const dailyPnl = trades.filter((trade) => trade.closedAt.startsWith(today)).reduce((sum, trade) => sum + trade.realizedPnl, 0);
  const equity = account ? account.cash + openPositions.reduce((sum, position) => sum + (prices[position.symbol] ?? position.entryPrice) * position.quantity, 0) : null;
  const openRisk = openPositions.reduce((sum, position) => sum + (position.stopLoss == null ? 0 : Math.abs(position.entryPrice - position.stopLoss) * position.quantity), 0);
  let peakEquity = 100_000;
  let historicalEquity = 100_000;
  let maxDrawdown = 0;
  for (const trade of trades.slice().sort((a, b) => a.closedAt.localeCompare(b.closedAt))) {
    historicalEquity += trade.realizedPnl;
    peakEquity = Math.max(peakEquity, historicalEquity);
    maxDrawdown = Math.max(maxDrawdown, peakEquity > 0 ? (peakEquity - historicalEquity) / peakEquity : 0);
  }
  const stats = [
    { label: 'Paper Equity', value: equity == null ? '--' : `$${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: DollarSign, color: 'text-primary' },
    { label: 'Realized P&L', value: account ? `${realizedPnl >= 0 ? '+' : ''}$${realizedPnl.toFixed(2)}` : '--', icon: TrendingUp, color: realizedPnl >= 0 ? 'text-success' : 'text-danger' },
    { label: 'Daily Realized P&L', value: account ? `${dailyPnl >= 0 ? '+' : ''}$${dailyPnl.toFixed(2)}` : '--', icon: Activity, color: dailyPnl >= 0 ? 'text-success' : 'text-danger' },
    { label: 'Open Risk at Stop', value: account ? `$${openRisk.toFixed(2)}` : '--', icon: Briefcase, color: 'text-warning' },
    { label: 'Max Drawdown', value: trades.length ? `${(maxDrawdown * 100).toFixed(2)}%` : '--', icon: Activity, color: 'text-danger' },
    { label: 'Win Rate', value: trades.length ? `${((wins / trades.length) * 100).toFixed(0)}%` : '--', icon: TrendingUp, color: 'text-text' },
  ];

  const close = async (symbol: string) => {
    setClosingSymbol(symbol);
    setError(null);
    try {
      await closePaperPosition(symbol);
      await refresh();
    } catch {
      setError(`Could not close ${symbol}. The position remains open.`);
    } finally {
      setClosingSymbol(null);
    }
  };

  return (
    <div className="page-frame space-y-6">
      <div className="flex items-center justify-between"><div><div className="page-eyebrow"><Briefcase className="w-3.5 h-3.5" /> Paper trading</div><h1>Portfolio</h1></div><button type="button" onClick={() => void refresh()} disabled={loading} className="p-2 rounded-lg hover:bg-surface text-muted disabled:opacity-50" title="Refresh paper account" aria-label="Refresh paper account"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button></div>
      {error && <div role="alert" className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg p-3">{error}</div>}
      {account && <div className="text-xs text-muted">Equity marks open positions to the latest available crypto quote; unavailable quotes use entry price.</div>}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">{stats.map((stat) => { const Icon = stat.icon; return <div key={stat.label} className="bg-surface border border-border rounded-xl p-4"><div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center"><Icon className={`w-4 h-4 ${stat.color}`} /></div></div><div className="text-xs text-muted">{stat.label}</div><div className={`text-lg font-semibold tabular-nums ${stat.color}`}>{stat.value}</div></div>; })}</div>

      <section className="bg-surface border border-border rounded-xl p-4">
        <h2 className="text-xs font-medium text-muted mb-3">Open Positions</h2>
        {loading && !account ? <div className="text-xs text-muted text-center py-8">Loading paper account…</div> : openPositions.length ? <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-muted border-b border-border"><th className="text-left py-2">Symbol</th><th className="text-left py-2">Side</th><th className="text-right py-2">Qty</th><th className="text-right py-2">Entry / Mark</th><th className="text-right py-2">Unrealized P&L</th><th className="text-right py-2">Stop / Target</th><th className="text-right py-2">Action</th></tr></thead><tbody>{openPositions.map((position) => { const mark = prices[position.symbol] ?? position.entryPrice; const pnl = (position.side === 'buy' ? mark - position.entryPrice : position.entryPrice - mark) * position.quantity; return <tr key={position.id} className="border-b border-border/50"><td className="py-2 font-medium">{position.symbol}</td><td className={`py-2 uppercase ${position.side === 'buy' ? 'text-success' : 'text-danger'}`}>{position.side}</td><td className="py-2 text-right">{position.quantity}</td><td className="py-2 text-right">{position.entryPrice.toFixed(2)} / {prices[position.symbol]?.toFixed(2) ?? '--'}</td><td className={`py-2 text-right ${pnl >= 0 ? 'text-success' : 'text-danger'}`}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</td><td className="py-2 text-right text-muted">{position.stopLoss?.toFixed(2) ?? '--'} / {position.takeProfit?.toFixed(2) ?? '--'}</td><td className="py-2 text-right"><button type="button" onClick={() => void close(position.symbol)} disabled={closingSymbol === position.symbol} className="px-2 py-1 rounded border border-border text-muted hover:text-danger disabled:opacity-50" aria-label={`Close ${position.symbol} paper position`}>{closingSymbol === position.symbol ? 'Closing…' : <span className="flex items-center gap-1"><X className="w-3 h-3" /> Close</span>}</button></td></tr>; })}</tbody></table></div> : !error && <div className="text-xs text-muted text-center py-8">No open paper positions for this account.</div>}
      </section>

      <section className="bg-surface border border-border rounded-xl p-4"><h2 className="text-xs font-medium text-muted mb-3">Trade History</h2>{trades.length ? <div className="space-y-2">{trades.slice().reverse().map((trade) => <div key={trade.id} className="flex items-center justify-between gap-3 text-xs border-b border-border/50 pb-2"><span className="font-medium">{trade.symbol} <span className="text-muted uppercase">{trade.side}</span><span className="block text-[10px] text-muted">{new Date(trade.closedAt).toLocaleString()}</span></span><span className={trade.realizedPnl >= 0 ? 'text-success' : 'text-danger'}>{trade.realizedPnl >= 0 ? '+' : ''}${trade.realizedPnl.toFixed(2)}</span></div>)}</div> : <div className="text-xs text-muted text-center py-8">No completed paper trades yet.</div>}</section>
    </div>
  );
}
