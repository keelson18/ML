import { useCallback, useEffect, useState } from 'react';
import { Star, Plus, X, RefreshCw, Search, ArrowUpDown, ExternalLink } from 'lucide-react';
import { formatMarketPrice, getMarket, getTrackedMarkets } from '../../lib/markets';
import { getDataProvider } from '../../lib/providers';
import { workspaceApi } from '../../api/workspace';
import { ALL_MARKET_TYPES, getMarketTypeLabel } from '../../lib/markets';
import type { MarketType } from '../../lib/types';

interface Props {
  userId?: string;
}

interface Quote {
  price: number;
  change: number | null;
  updatedAt: number;
}

export default function WatchlistsPage({ userId }: Props) {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | MarketType>('all');
  const [sortAscending, setSortAscending] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setError('Sign in to load your watchlist.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setSymbols(await workspaceApi.getWatchlist(userId));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not load your watchlist.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const loadQuotes = useCallback(async () => {
    if (!symbols.length) {
      setQuotes({});
      return;
    }
    setQuoteLoading(true);
    const entries = await Promise.all(symbols.map(async (symbol) => {
      try {
        const candles = await getDataProvider(symbol).fetchKlines(symbol, '1d', 2);
        const latest = candles.at(-1);
        if (!latest) return null;
        const previous = candles.at(-2);
        return [symbol, { price: latest.close, change: previous ? ((latest.close - previous.close) / previous.close) * 100 : null, updatedAt: latest.time * 1000 }] as const;
      } catch {
        return null;
      }
    }));
    setQuotes(Object.fromEntries(entries.filter((entry): entry is [string, Quote] => entry !== null)));
    setQuoteLoading(false);
  }, [symbols]);

  const availableMarkets = getTrackedMarkets();
  const filteredMarkets = availableMarkets
    .filter((market) => (category === 'all' || market.marketType === category)
      && `${market.symbol} ${market.label}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((left, right) => (sortAscending ? 1 : -1) * left.symbol.localeCompare(right.symbol));
  const displayedSymbols = [...symbols].sort((left, right) => (sortAscending ? 1 : -1) * left.localeCompare(right));

  useEffect(() => { void loadQuotes(); }, [loadQuotes]);

  const saveSymbols = async (next: string[]) => {
    if (!userId) return;
    setSaving(true);
    setError(null);
    try {
      await workspaceApi.saveWatchlist(userId, next);
      setSymbols(next);
      setAdding(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not save your watchlist.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-frame space-y-6">
      <div className="page-heading">
        <div className="page-heading-copy"><div className="page-eyebrow"><Star className="w-3.5 h-3.5" /> Personal workspace</div><h1>Watchlists</h1><p>Monitor supported cryptocurrency and commodity instruments with provider-backed quotes.</p></div>
        <button type="button" onClick={() => { void load(); }} disabled={loading} className="p-2 rounded-lg hover:bg-surface text-muted disabled:opacity-50" title="Refresh watchlist" aria-label="Refresh watchlist"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      <section className="bg-surface border border-border rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4"><h2 className="text-xs font-medium text-muted">Default Watchlist</h2><button type="button" onClick={() => setAdding((open) => !open)} disabled={saving} className="px-3 py-1.5 rounded-lg bg-primary text-black text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1 disabled:opacity-50"><Plus className="w-3 h-3" /> Add Symbol</button></div>
        {error && <div role="alert" className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg p-3 mb-4">{error}</div>}
        {adding && <div className="mb-4 space-y-3"><div className="flex flex-wrap gap-2"><label className="flex min-w-48 flex-1 items-center gap-2 rounded border border-border bg-bg px-2"><Search className="h-3.5 w-3.5 text-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search instruments" aria-label="Search instruments" className="w-full bg-transparent py-2 text-xs outline-none" /></label><select value={category} onChange={(event) => setCategory(event.target.value as typeof category)} aria-label="Filter instrument category" className="rounded border border-border bg-bg px-2 text-xs"><option value="all">All markets</option>{ALL_MARKET_TYPES.map((marketType) => <option key={marketType} value={marketType}>{getMarketTypeLabel(marketType)}</option>)}</select></div><div className="flex flex-wrap gap-2">{filteredMarkets.filter((pair) => !symbols.includes(pair.symbol)).map((pair) => <button type="button" key={pair.symbol} disabled={saving || loading} onClick={() => void saveSymbols([...symbols, pair.symbol])} className="rounded bg-bg border border-border px-2 py-1 text-xs hover:border-primary disabled:opacity-50">{pair.label}</button>)}</div></div>}
        {loading ? <div className="text-xs text-muted text-center py-8">Loading watchlist…</div> : symbols.length ? <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-border text-muted"><th className="py-2 text-left">Instrument</th><th className="py-2 text-right">Last price</th><th className="py-2 text-right">1D change</th><th className="py-2 text-right">Status</th><th className="py-2 text-right"><button type="button" onClick={() => setSortAscending((value) => !value)} className="inline-flex items-center gap-1">Sort <ArrowUpDown className="h-3 w-3" /></button></th></tr></thead><tbody>{displayedSymbols.map((symbol) => { const market = getMarket(symbol); const quote = quotes[symbol]; const stale = quote ? Date.now() - quote.updatedAt > 24 * 60 * 60 * 1000 : false; return <tr key={symbol} className="border-b border-border/50"><td className="py-3"><div className="font-medium">{symbol}</div><div className="text-[11px] text-muted">{market?.label ?? 'Unknown instrument'} · {market?.provider ?? 'unavailable'}</div></td><td className="py-3 text-right tabular-nums">{quote ? formatMarketPrice(symbol, quote.price, 4) : quoteLoading ? 'Loading…' : '--'}</td><td className={`py-3 text-right tabular-nums ${quote?.change == null ? 'text-muted' : quote.change >= 0 ? 'text-success' : 'text-danger'}`}>{quote?.change == null ? '--' : `${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(2)}%`}</td><td className="py-3 text-right">{quote && !stale ? <span className="text-success">Available</span> : <span className="text-warning">{quote ? 'Stale' : 'Unavailable'}</span>}</td><td className="py-3 text-right"><div className="flex justify-end gap-2"><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('qi:navigate-market', { detail: { symbol } }))} className="p-1 text-muted hover:text-primary" title={`Open ${symbol} chart`} aria-label={`Open ${symbol} chart`}><ExternalLink className="h-3.5 w-3.5" /></button><button type="button" disabled={saving} onClick={() => void saveSymbols(symbols.filter((item) => item !== symbol))} className="p-1 text-muted hover:text-danger disabled:opacity-50" title={`Remove ${symbol}`} aria-label={`Remove ${symbol}`}><X className="w-3.5 h-3.5" /></button></div></td></tr>; })}</tbody></table></div> : !error && <div className="text-xs text-muted text-center py-8">Your watchlist is empty. Add symbols to start tracking them.</div>}
        <div className="flex items-center justify-between mt-3"><span className="text-xs text-muted">Saved to your account</span><button type="button" onClick={() => void loadQuotes()} disabled={quoteLoading || symbols.length === 0} className="flex items-center gap-1 text-xs text-muted hover:text-text disabled:opacity-50"><RefreshCw className={`w-3 h-3 ${quoteLoading ? 'animate-spin' : ''}`} /> Refresh quotes</button></div>
      </section>
    </div>
  );
}
