import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import type { MarketType } from '../../lib/types';
import { MARKET_TYPES } from '../../lib/types';
import { getDataProvider } from '../../lib/providers';
import { getMarketsByType } from '../../lib/markets';

type Quote = { price: number; change: number };

export default function MarketsPage() {
  const [selectedType, setSelectedType] = useState<MarketType>('crypto');
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const markets = useMemo(() => getMarketsByType(selectedType), [selectedType]);
  const marketTypeMeta = MARKET_TYPES.find((mt) => mt.value === selectedType);
  const provider = useMemo(() => getDataProvider(selectedType), [selectedType]);

  const loadQuotes = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all(markets.slice(0, 12).map(async (market) => {
      try {
        const candles = await provider.fetchKlines(market.symbol, '1d', 2);
        if (candles.length < 1) return null;
        const latest = candles[candles.length - 1];
        const previous = candles[candles.length - 2];
        return [market.symbol, { price: latest.close, change: previous ? ((latest.close - previous.close) / previous.close) * 100 : 0 }] as const;
      } catch {
        return null;
      }
    })).then((entries) => {
      if (!cancelled) {
        const usableEntries = entries.filter((entry): entry is [string, Quote] => Boolean(entry));
        setQuotes(Object.fromEntries(usableEntries));
        if (!usableEntries.length) setError(`${provider.name} quote data is unavailable.`);
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [markets, provider]);

  useEffect(() => loadQuotes(), [loadQuotes]);

  const quoteEntries = Object.entries(quotes);
  const topGainer = quoteEntries.slice().sort((a, b) => b[1].change - a[1].change)[0];
  const topLoser = quoteEntries.slice().sort((a, b) => a[1].change - b[1].change)[0];

  return (
    <div className="page-frame space-y-6">
      <div className="page-heading"><div className="page-heading-copy"><div className="page-eyebrow"><BarChart3 className="w-3.5 h-3.5" /> Market overview</div><h1>Markets</h1><p>Browse supported instruments and the latest provider-backed daily quote where a data source is configured.</p></div><button onClick={loadQuotes} className="p-2 rounded-lg hover:bg-surface text-muted" title="Refresh quotes"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button></div>
      <div className="flex gap-1 p-1 rounded-lg bg-surface border border-border w-fit max-w-full overflow-x-auto">{MARKET_TYPES.map((marketType) => <button key={marketType.value} onClick={() => setSelectedType(marketType.value)} className={`whitespace-nowrap px-3 py-1.5 rounded text-xs font-medium transition-colors ${selectedType === marketType.value ? 'bg-primary text-black' : 'text-muted hover:text-text'}`}>{marketType.icon} {marketType.label}</button>)}</div>
      {error && <div role="alert" className="text-xs text-warning bg-warning/10 border border-warning/20 rounded-lg p-3">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Supported Markets" value={String(markets.length)} />
        <Stat label="Category" value={marketTypeMeta?.label ?? selectedType} />
        <Stat label="Top Gainer" value={topGainer ? `${topGainer[0]} ${topGainer[1].change >= 0 ? '+' : ''}${topGainer[1].change.toFixed(2)}%` : loading ? 'Loading' : 'Unavailable'} tone={topGainer ? 'text-success' : 'text-muted'} />
        <Stat label="Top Loser" value={topLoser ? `${topLoser[0]} ${topLoser[1].change.toFixed(2)}%` : loading ? 'Loading' : 'Unavailable'} tone={topLoser ? 'text-danger' : 'text-muted'} />
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-border text-muted"><th className="text-left px-4 py-3 font-medium">Symbol</th><th className="text-left px-4 py-3 font-medium">Name</th><th className="text-right px-4 py-3 font-medium">Last Price</th><th className="text-right px-4 py-3 font-medium">1D</th><th className="text-left px-4 py-3 font-medium">Exchange</th><th className="text-left px-4 py-3 font-medium">Feed</th></tr></thead><tbody>{markets.map((market) => { const quote = quotes[market.symbol]; return <tr key={market.symbol} className="border-b border-border/50 hover:bg-bg/50 transition-colors"><td className="px-4 py-3 font-medium">{market.symbol}</td><td className="px-4 py-3 text-muted">{market.label}</td><td className="px-4 py-3 text-right tabular-nums">{quote ? quote.price.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '--'}</td><td className={`px-4 py-3 text-right tabular-nums ${quote ? quote.change >= 0 ? 'text-success' : 'text-danger' : 'text-muted'}`}>{quote ? `${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(2)}%` : '--'}</td><td className="px-4 py-3 text-muted">{market.exchange}</td><td className="px-4 py-3"><span className={`px-1.5 py-0.5 rounded text-[10px] ${quote ? 'bg-success/10 text-success' : 'bg-bg text-muted'}`}>{quote ? 'Quoted' : 'No quote'}</span></td></tr>; })}{markets.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No supported markets found.</td></tr>}</tbody></table></div></div>
    </div>
  );
}

function Stat({ label, value, tone = 'text-text' }: { label: string; value: string; tone?: string }) {
  return <div className="bg-surface border border-border rounded-xl p-4"><div className="text-[10px] text-muted mb-1">{label}</div><div className={`text-sm font-semibold ${tone}`}>{value}</div></div>;
}
