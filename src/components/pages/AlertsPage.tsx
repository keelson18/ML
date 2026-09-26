import { useEffect, useState, type FormEvent } from 'react';
import { Bell, Plus, Trash2, X } from 'lucide-react';
import PageFrame from '../PageFrame';

interface AlertRule { id: number; symbol: string; price: number; direction: 'above' | 'below'; }

interface Props {
  userId?: string;
}

const ALERT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

function isAlertRule(value: unknown): value is AlertRule {
  if (!value || typeof value !== 'object') return false;
  const alert = value as Record<string, unknown>;
  return typeof alert.id === 'number'
    && typeof alert.symbol === 'string'
    && typeof alert.price === 'number'
    && Number.isFinite(alert.price)
    && (alert.direction === 'above' || alert.direction === 'below');
}

function loadAlerts(storageKey: string): AlertRule[] {
  const stored = localStorage.getItem(storageKey);
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isAlertRule) : [];
  } catch {
    return [];
  }
}

export default function AlertsPage({ userId }: Props) {
  const storageKey = `quantum-alerts:${userId ?? 'local'}`;
  const [alerts, setAlerts] = useState<AlertRule[]>(() => loadAlerts(storageKey));
  const [symbol, setSymbol] = useState(ALERT_SYMBOLS[0]);
  const [price, setPrice] = useState('');
  const [direction, setDirection] = useState<AlertRule['direction']>('above');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(alerts));
  }, [alerts, storageKey]);

  const createAlert = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      setError('Enter a price greater than zero.');
      return;
    }

    setAlerts((current) => [...current, { id: Date.now(), symbol, price: numericPrice, direction }]);
    setPrice('');
    setError('');
    setCreating(false);
  };

  const deleteAlert = (id: number) => {
    setAlerts((current) => current.filter((alert) => alert.id !== id));
  };

  return (
    <PageFrame
      title="Alerts"
      eyebrow="Control center"
      description="Set price triggers and keep important market levels in view."
      icon={Bell}
      actions={(
        <button
          type="button"
          onClick={() => { setCreating((current) => !current); setError(''); }}
          aria-expanded={creating}
          aria-controls="create-alert-form"
          className="px-3 py-2 rounded-lg bg-primary text-black text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1"
        >
          {creating ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          {creating ? 'Close' : 'Create Alert'}
        </button>
      )}
    >
      {creating && (
        <form id="create-alert-form" onSubmit={createAlert} className="bg-surface border border-border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end" aria-label="Create price alert">
          <label className="text-[10px] text-muted" htmlFor="alert-symbol">
            Symbol
            <select id="alert-symbol" value={symbol} onChange={(event) => setSymbol(event.target.value)} className="mt-1 w-full px-2 py-2 rounded bg-bg border border-border text-text text-xs">
              {ALERT_SYMBOLS.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label className="text-[10px] text-muted" htmlFor="alert-direction">
            Condition
            <select id="alert-direction" value={direction} onChange={(event) => setDirection(event.target.value as AlertRule['direction'])} className="mt-1 w-full px-2 py-2 rounded bg-bg border border-border text-text text-xs">
              <option value="above">Price above</option>
              <option value="below">Price below</option>
            </select>
          </label>
          <label className="text-[10px] text-muted" htmlFor="alert-price">
            Price
            <input id="alert-price" value={price} onChange={(event) => { setPrice(event.target.value); setError(''); }} type="number" min="0" step="any" inputMode="decimal" required aria-describedby={error ? 'alert-price-error' : undefined} className="mt-1 w-full px-2 py-2 rounded bg-bg border border-border text-text text-xs" />
          </label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setCreating(false); setError(''); }} className="px-3 py-2 rounded border border-border text-muted text-xs font-medium hover:text-text hover:bg-bg transition-colors">Cancel</button>
            <button type="submit" className="px-3 py-2 rounded bg-primary text-black text-xs font-medium">Create</button>
          </div>
          {error && <p id="alert-price-error" role="alert" className="text-xs text-danger sm:col-span-2 lg:col-span-4">{error}</p>}
        </form>
      )}

      <section aria-labelledby="active-alerts-heading" className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div><h3 id="active-alerts-heading" className="text-xs font-medium text-muted">Configured Alerts</h3><p className="text-[10px] text-muted mt-1">Saved locally; live trigger monitoring is not connected.</p></div>
          <span className="text-[10px] text-muted" aria-live="polite">{alerts.length} {alerts.length === 1 ? 'alert' : 'alerts'}</span>
        </div>
        {alerts.length > 0 ? (
          <ul className="space-y-2">
            {alerts.map((alert) => (
              <li key={alert.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-bg border border-border text-xs">
                <span>
                  <strong>{alert.symbol}</strong>{' '}
                  <span className="text-muted">Price {alert.direction} ${alert.price.toLocaleString(undefined, { maximumFractionDigits: 8 })}</span>
                </span>
                <button type="button" onClick={() => deleteAlert(alert.id)} className="p-1 text-muted hover:text-danger" title="Delete alert" aria-label={`Delete ${alert.symbol} alert`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-xs text-muted text-center py-8">
            <Bell className="w-5 h-5 mx-auto mb-2 opacity-60" aria-hidden="true" />
            <p>No alerts configured.</p>
            <p className="mt-1">Create an alert to monitor a price level.</p>
          </div>
        )}
      </section>
    </PageFrame>
  );
}
