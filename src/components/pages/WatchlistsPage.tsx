import { useEffect, useState } from 'react';
import { Star, Plus, X } from 'lucide-react';
import { TRACKED_PAIRS } from '../../lib/types';

interface Props {
  userId?: string;
}

function loadSymbols(storageKey: string): string[] {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.every((value): value is string => typeof value === 'string')
      ? [...new Set(parsed)]
      : [];
  } catch {
    return [];
  }
}

export default function WatchlistsPage({ userId }: Props) {
  const storageKey = `quantum-watchlist:${userId ?? 'local'}`;
  const [symbols, setSymbols] = useState<string[]>(() => loadSymbols(storageKey));
  const [adding, setAdding] = useState(false);

  useEffect(() => setSymbols(loadSymbols(storageKey)), [storageKey]);
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(symbols)); }, [symbols, storageKey]);

  const addSymbol = (symbol: string) => {
    setSymbols((current) => current.includes(symbol) ? current : [...current, symbol]);
    setAdding(false);
  };

  return (
    <div className="page-frame space-y-6">
      <div className="page-heading">
        <div className="page-heading-copy"><div className="page-eyebrow"><Star className="w-3.5 h-3.5" /> Personal workspace</div><h1>Watchlists</h1><p>Keep a focused set of symbols for the dashboard and terminal. Quotes remain provider-dependent.</p></div>
        <span className="text-xs text-muted">Saved locally for this account</span>
      </div>

      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-4"><h2 className="text-xs font-medium text-muted">Default Watchlist</h2><button onClick={() => setAdding((open) => !open)} className="px-3 py-1.5 rounded-lg bg-primary text-black text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1"><Plus className="w-3 h-3" /> Add Symbol</button></div>
        {adding && <div className="flex flex-wrap gap-2 mb-4">{TRACKED_PAIRS.filter((pair) => !symbols.includes(pair.symbol)).map((pair) => <button key={pair.symbol} onClick={() => addSymbol(pair.symbol)} className="px-2 py-1 rounded bg-bg border border-border text-xs hover:border-primary">{pair.label}</button>)}{TRACKED_PAIRS.every((pair) => symbols.includes(pair.symbol)) && <span className="text-xs text-muted">All supported crypto symbols are already saved.</span>}</div>}
        {symbols.length ? <div className="space-y-2">{symbols.map((symbol) => <div key={symbol} className="flex items-center justify-between px-3 py-2 rounded-lg bg-bg border border-border text-xs"><span className="font-medium">{symbol}</span><button onClick={() => setSymbols((current) => current.filter((item) => item !== symbol))} className="p-1 text-muted hover:text-danger" title={`Remove ${symbol}`}><X className="w-3.5 h-3.5" /></button></div>)}</div> : <div className="text-xs text-muted text-center py-8">Your watchlist is empty. Add symbols to track them here.</div>}
      </div>
    </div>
  );
}
