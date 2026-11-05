import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, ExternalLink, RefreshCw } from 'lucide-react';
import type { MarketType } from '../../lib/types';
import { formatMarketPrice, getSupportedProductMarkets } from '../../lib/markets';
import { fetchCanonicalMarketData } from '../../lib/backend-api';

type Quote = { price: number; change: number; stale: boolean };
const MARKET_TYPES: Array<{ value: MarketType; label: string }> = [
  { value: 'crypto', label: 'Crypto' },
  { value: 'commodity', label: 'Commodities' },
  { value: 'forex', label: 'Forex' },
  { value: 'index', label: 'Indices' },
  { value: 'stock', label: 'Stocks' },
];

export default function MarketsPage() {
  const [selectedType, setSelectedType] = useState<MarketType>('crypto');
  const [page, setPage] = useState(0);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [checkedSymbols, setCheckedSymbols] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const requestId = useRef(0);
  const markets = useMemo(() => {
    const query = search.trim().toLowerCase();
    const instruments = getSupportedProductMarkets().filter((market) => market.marketType === selectedType);
    return query ? instruments.filter((market) => market.symbol.toLowerCase().includes(query) || market.label.toLowerCase().includes(query)) : instruments;
  }, [selectedType, search]);
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(markets.length / pageSize));
  const visibleMarkets = useMemo(() => markets.slice(page * pageSize, (page + 1) * pageSize), [markets, page]);

  const loadQuotes = useCallback(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    Promise.all(visibleMarkets.map(async (market) => {
      try {
        const response = await fetchCanonicalMarketData(market.symbol, '1d', 2);
        const latest = response.candles.at(-1);
        if (!latest) return { symbol: market.symbol, quote: null };
        const previous = response.candles.at(-2);
        return { symbol: market.symbol, quote: { price: latest.close, change: previous ? ((latest.close - previous.close) / previous.close) * 100 : 0, stale: response.stale } };
      } catch {
        return { symbol: market.symbol, quote: null };
      }
    })).then((results) => {
      if (requestId.current !== id) return;
      const usable = results.filter((result): result is typeof result & { quote: Quote } => result.quote !== null);
      setQuotes(Object.fromEntries(usable.map(({ symbol, quote }) => [symbol, quote])));
      setCheckedSymbols(new Set(results.map(({ symbol }) => symbol)));
      if (usable.length !== results.length) setError(`${results.length - usable.length} quote(s) are unavailable from configured providers.`);
    }).finally(() => { if (requestId.current === id) setLoading(false); });
  }, [visibleMarkets]);

  useEffect(() => { void loadQuotes(); return () => { requestId.current += 1; }; }, [loadQuotes]);
  useEffect(() => { if (page >= pageCount) setPage(0); }, [page, pageCount]);

  return <div className="page-frame space-y-6">
    <div className="page-heading"><div className="page-heading-copy"><div className="page-eyebrow"><BarChart3 className="w-3.5 h-3.5" /> Market overview</div><h1>Markets</h1><p>Browse active cryptocurrency and commodity instruments with provider-backed data.</p></div><button type="button" onClick={() => void loadQuotes()} disabled={loading} className="rounded-lg p-2 text-muted hover:bg-surface disabled:opacity-50" aria-label="Refresh market quotes"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div>
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1 w-fit">{MARKET_TYPES.map((type) => <button key={type.value} type="button" onClick={() => { setSelectedType(type.value); setPage(0); }} className={`whitespace-nowrap rounded px-3 py-1.5 text-xs font-medium ${selectedType === type.value ? 'bg-primary text-black' : 'text-muted hover:text-text'}`}>{type.label}</button>)}</div>
      <label className="text-xs text-muted">Search<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Symbol or name" className="ml-2 rounded-lg border border-border bg-bg px-2 py-1.5 text-xs text-text" /></label>
    </div>
    {error && <div role="alert" className="rounded-lg border border-warning/20 bg-warning/10 p-3 text-xs text-warning">{error}</div>}
    <div className="overflow-hidden rounded-xl border border-border bg-surface"><div className="flex items-center justify-between border-b border-border px-4 py-3 text-xs text-muted"><span>{markets.length} supported instruments · Page {page + 1} of {pageCount}</span><div className="flex gap-2"><button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0} className="rounded border border-border px-2 py-1 disabled:opacity-40">Previous</button><button type="button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={page >= pageCount - 1} className="rounded border border-border px-2 py-1 disabled:opacity-40">Next</button></div></div><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-border text-muted"><th className="px-4 py-3 text-left">Instrument</th><th className="px-4 py-3 text-right">Last price</th><th className="px-4 py-3 text-right">1D</th><th className="px-4 py-3 text-left">Data</th><th className="px-4 py-3 text-right">Chart</th></tr></thead><tbody>{visibleMarkets.map((market) => { const quote = quotes[market.symbol]; return <tr key={market.symbol} className="border-b border-border/50 hover:bg-bg/50"><td className="px-4 py-3"><strong>{market.symbol}</strong><div className="text-muted">{market.label} · {market.marketType}</div></td><td className="px-4 py-3 text-right tabular-nums">{quote ? formatMarketPrice(market.symbol, quote.price, 4) : '--'}</td><td className={`px-4 py-3 text-right tabular-nums ${quote ? quote.change >= 0 ? 'text-success' : 'text-danger' : 'text-muted'}`}>{quote ? `${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(2)}%` : '--'}</td><td className="px-4 py-3">{quote ? <span className={quote.stale ? 'text-warning' : 'text-success'}>{quote.stale ? 'Stale' : 'Available'}</span> : <span className="text-muted">{!checkedSymbols.has(market.symbol) ? 'Checking…' : 'Unavailable'}</span>}<div className="text-[11px] text-muted">{market.provider}</div></td><td className="px-4 py-3 text-right"><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('qi:navigate-market', { detail: { symbol: market.symbol } }))} aria-label={`Open ${market.symbol} chart`} className="rounded p-1 text-muted hover:text-primary"><ExternalLink className="h-4 w-4" /></button></td></tr>; })}</tbody></table></div></div>
  </div>;
}
