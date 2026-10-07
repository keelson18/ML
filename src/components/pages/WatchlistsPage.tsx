import { useCallback, useEffect, useState } from 'react';
import { Star, Plus, X, RefreshCw } from 'lucide-react';
import { getTrackedMarkets } from '../../lib/markets';
import { getDataProvider } from '../../lib/providers';
import { workspaceApi } from '../../api/workspace';

interface Props {
  userId?: string;
}

interface Quote {
  price: number;
  change: number | null;
}

export default function WatchlistsPage({ userId }: Props) {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        return [symbol, { price: latest.close, change: previous ? ((latest.close - previous.close) / previous.close) * 100 : null }] as const;
      } catch {
        return null;
      }
    }));
    setQuotes(Object.fromEntries(entries.filter((entry): entry is [string, Quote] => entry !== null)));
    setQuoteLoading(false);
  }, [symbols]);

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
        <div className="page-heading-copy"><div className="page-eyebrow"><Star className="w-3.5 h-3.5" /> Personal workspace</div><h1>Watchlists</h1><p>Save supported crypto symbols to your account and review provider-backed daily quotes.</p></div>
        <button type="button" onClick={() => { void load(); }} disabled={loading} className="p-2 rounded-lg hover:bg-surface text-muted disabled:opacity-50" title="Refresh watchlist" aria-label="Refresh watchlist"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      <section className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 mb-4"><h2 className="text-xs font-medium text-muted">Default Watchlist</h2><button type="button" onClick={() => setAdding((open) => !open)} disabled={saving} className="px-3 py-1.5 rounded-lg bg-primary text-black text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1 disabled:opacity-50"><Plus className="w-3 h-3" /> Add Symbol</button></div>
        {error && <div role="alert" className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg p-3 mb-4">{error}</div>}
        {adding && <div className="flex flex-wrap gap-2 mb-4">{getTrackedMarkets().filter((pair) => !symbols.includes(pair.symbol)).map((pair) => <button type="button" key={pair.symbol} disabled={saving || loading} onClick={() => void saveSymbols([...symbols, pair.symbol])} className="px-2 py-1 rounded bg-bg border border-border text-xs hover:border-primary disabled:opacity-50">{pair.label}</button>)}{getTrackedMarkets().every((pair) => symbols.includes(pair.symbol)) && <span className="text-xs text-muted">All supported crypto symbols are already saved.</span>}</div>}
        {loading ? <div className="text-xs text-muted text-center py-8">Loading watchlist…</div> : symbols.length ? <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-border text-muted"><th className="text-left py-2">Symbol</th><th className="text-right py-2">Last Price</th><th className="text-right py-2">1D Change</th><th className="text-right py-2">Actions</th></tr></thead><tbody>{symbols.map((symbol) => <tr key={symbol} className="border-b border-border/50"><td className="py-3 font-medium">{symbol}</td><td className="py-3 text-right tabular-nums">{quotes[symbol]?.price.toLocaleString(undefined, { maximumFractionDigits: 4 }) ?? (quoteLoading ? 'Loading…' : '--')}</td><td className={`py-3 text-right tabular-nums ${quotes[symbol]?.change == null ? 'text-muted' : quotes[symbol].change >= 0 ? 'text-success' : 'text-danger'}`}>{quotes[symbol]?.change == null ? '--' : `${quotes[symbol].change >= 0 ? '+' : ''}${quotes[symbol].change.toFixed(2)}%`}</td><td className="py-3 text-right"><button type="button" disabled={saving} onClick={() => void saveSymbols(symbols.filter((item) => item !== symbol))} className="p-1 text-muted hover:text-danger disabled:opacity-50" title={`Remove ${symbol}`} aria-label={`Remove ${symbol}`}><X className="w-3.5 h-3.5" /></button></td></tr>)}</tbody></table></div> : !error && <div className="text-xs text-muted text-center py-8">Your watchlist is empty. Add symbols to start tracking them.</div>}
        <div className="flex items-center justify-between mt-3"><span className="text-[10px] text-muted">Saved to your account</span><button type="button" onClick={() => void loadQuotes()} disabled={quoteLoading || symbols.length === 0} className="flex items-center gap-1 text-[10px] text-muted hover:text-text disabled:opacity-50"><RefreshCw className={`w-3 h-3 ${quoteLoading ? 'animate-spin' : ''}`} /> Refresh quotes</button></div>
      </section>
    </div>
  );
}
