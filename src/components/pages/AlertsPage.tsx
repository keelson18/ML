import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Bell, Plus, Trash2, X, Radio } from 'lucide-react';
import PageFrame from '../PageFrame';
import { TRACKED_PAIRS } from '../../lib/types';
import { getDataProvider } from '../../lib/providers';
import { workspaceApi, type PriceAlert } from '../../api/workspace';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [symbol, setSymbol] = useState<string>(TRACKED_PAIRS[0].symbol);
  const [price, setPrice] = useState('');
  const [direction, setDirection] = useState<PriceAlert['direction']>('above');
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggering = useRef(new Set<string>());
  const provider = useMemo(() => getDataProvider('crypto'), []);
  const activeAlerts = useMemo(() => alerts.filter((alert) => alert.active), [alerts]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAlerts(await workspaceApi.getAlerts());
    } catch {
      setError('Could not load your alerts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const symbols = [...new Set(activeAlerts.map((alert) => alert.symbol))];
    const unsubscribe = symbols.map((trackedSymbol) => provider.subscribeKlines(trackedSymbol, '1m', (candle) => {
      const crossed = activeAlerts.filter((alert) => alert.symbol === trackedSymbol
        && (alert.direction === 'above' ? candle.close >= alert.targetPrice : candle.close <= alert.targetPrice));
      for (const alert of crossed) {
        if (triggering.current.has(alert.id)) continue;
        triggering.current.add(alert.id);
        workspaceApi.markAlertTriggered(alert.id).then(() => {
          setAlerts((current) => current.map((item) => item.id === alert.id ? { ...item, active: false, triggeredAt: new Date().toISOString() } : item));
        }).catch(() => {
          triggering.current.delete(alert.id);
          setError('A price alert was reached but could not be saved.');
        });
      }
    }));
    return () => unsubscribe.forEach((stop) => stop());
  }, [activeAlerts, provider]);

  const createAlert = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const targetPrice = Number(price);
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      setError('Enter a price greater than zero.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const alert = await workspaceApi.createAlert({ symbol, targetPrice, direction });
      setAlerts((current) => [alert, ...current]);
      setPrice('');
      setCreating(false);
    } catch {
      setError('Could not create this alert. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const deleteAlert = async (id: string) => {
    setError(null);
    try {
      await workspaceApi.deleteAlert(id);
      setAlerts((current) => current.filter((alert) => alert.id !== id));
    } catch {
      setError('Could not delete this alert. Please try again.');
    }
  };

  return (
    <PageFrame
      title="Alerts"
      eyebrow="Control center"
      description="Save price triggers to your account and monitor them while this page is open."
      icon={Bell}
      actions={(
        <button type="button" onClick={() => { setCreating((current) => !current); setError(null); }} aria-expanded={creating} aria-controls="create-alert-form" className="px-3 py-2 rounded-lg bg-primary text-black text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1">
          {creating ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}{creating ? 'Close' : 'Create Alert'}
        </button>
      )}
    >
      {creating && <form id="create-alert-form" onSubmit={(event) => void createAlert(event)} className="bg-surface border border-border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end" aria-label="Create price alert">
        <label className="text-[10px] text-muted" htmlFor="alert-symbol">Symbol<select id="alert-symbol" value={symbol} onChange={(event) => setSymbol(event.target.value)} className="mt-1 w-full px-2 py-2 rounded bg-bg border border-border text-text text-xs">{TRACKED_PAIRS.map((pair) => <option key={pair.symbol} value={pair.symbol}>{pair.label}</option>)}</select></label>
        <label className="text-[10px] text-muted" htmlFor="alert-direction">Condition<select id="alert-direction" value={direction} onChange={(event) => setDirection(event.target.value as PriceAlert['direction'])} className="mt-1 w-full px-2 py-2 rounded bg-bg border border-border text-text text-xs"><option value="above">Price above</option><option value="below">Price below</option></select></label>
        <label className="text-[10px] text-muted" htmlFor="alert-price">Price<input id="alert-price" value={price} onChange={(event) => { setPrice(event.target.value); setError(null); }} type="number" min="0" step="any" inputMode="decimal" required className="mt-1 w-full px-2 py-2 rounded bg-bg border border-border text-text text-xs" /></label>
        <div className="flex items-center gap-2"><button type="button" onClick={() => setCreating(false)} className="px-3 py-2 rounded border border-border text-muted text-xs font-medium hover:text-text hover:bg-bg transition-colors">Cancel</button><button type="submit" disabled={saving} className="px-3 py-2 rounded bg-primary text-black text-xs font-medium disabled:opacity-50">{saving ? 'Saving…' : 'Create'}</button></div>
      </form>}

      {error && <div role="alert" className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg p-3">{error}</div>}

      <section aria-labelledby="active-alerts-heading" className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 mb-3"><div><h3 id="active-alerts-heading" className="text-xs font-medium text-muted">Price Alerts</h3><p className="text-[10px] text-muted mt-1">{activeAlerts.length ? 'Live checks are active while this page is open.' : 'Configured alerts stay saved to your account.'}</p></div><span className="text-[10px] text-muted flex items-center gap-1"><Radio className="w-3 h-3" />{activeAlerts.length} active</span></div>
        {loading ? <div className="text-xs text-muted text-center py-8">Loading alerts…</div> : alerts.length ? <ul className="space-y-2">{alerts.map((alert) => <li key={alert.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-bg border border-border text-xs"><span><strong>{alert.symbol}</strong>{' '}<span className="text-muted">{alert.active ? `Price ${alert.direction} $${alert.targetPrice.toLocaleString(undefined, { maximumFractionDigits: 8 })}` : `Triggered at ${new Date(alert.triggeredAt ?? alert.createdAt).toLocaleString()}`}</span></span><div className="flex items-center gap-2">{!alert.active && <span className="text-[10px] text-success">Triggered</span>}<button type="button" onClick={() => void deleteAlert(alert.id)} className="p-1 text-muted hover:text-danger" title="Delete alert" aria-label={`Delete ${alert.symbol} alert`}><Trash2 className="w-3.5 h-3.5" /></button></div></li>)}</ul> : <div className="text-xs text-muted text-center py-8"><Bell className="w-5 h-5 mx-auto mb-2 opacity-60" aria-hidden="true" /><p>No alerts configured.</p><p className="mt-1">Create a price level to monitor while you are signed in.</p></div>}
      </section>
    </PageFrame>
  );
}
