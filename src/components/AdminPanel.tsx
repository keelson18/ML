import { useCallback, useEffect, useState } from 'react';
import { Shield, Activity, Users, Brain, BookOpen, FileText, Settings, Play, Pause, RefreshCw, Database, CalendarDays } from 'lucide-react';
import { cancelEventBlackout, createEventBlackout, fetchAdminEventBlackouts, fetchAutonomyStatus, fetchMarketAvailability, probeMarkets, setAutonomyState, type AutonomyStatus, type EventBlackout, type MarketAvailabilityRecord } from '../lib/backend-api';
import AdminRoute from './AdminRoute';
import SystemMetrics from './Admin/SystemMetrics';
import UserManagement from './Admin/UserManagement';
import ModelManagement from './Admin/ModelManagement';
import CMSManager from './CMS/CMSManager';
import Logs from './Admin/Logs';

type AdminTab = 'metrics' | 'users' | 'models' | 'cms' | 'logs' | 'markets' | 'events' | 'settings';

const TABS: { key: AdminTab; label: string; icon: typeof Activity }[] = [
  { key: 'metrics', label: 'System Metrics', icon: Activity },
  { key: 'users', label: 'User Management', icon: Users },
  { key: 'models', label: 'ML Models', icon: Brain },
  { key: 'cms', label: 'Content (CMS)', icon: BookOpen },
  { key: 'logs', label: 'System Logs', icon: FileText },
  { key: 'markets', label: 'Market Availability', icon: Database },
  { key: 'events', label: 'Event Risk', icon: CalendarDays },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<AdminTab>('metrics');

  return (
    <AdminRoute>
      <div className="admin-shell bg-surface border border-border rounded-xl overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-border bg-gradient-to-r from-primary/5 via-surface to-surface">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold text-primary">Control center</p>
              <h1 className="text-base font-semibold">Administration</h1>
              <p className="text-xs text-muted mt-0.5">Manage access, research, and system operations.</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-success/25 bg-success/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-success">
            <span className="w-1.5 h-1.5 rounded-full bg-success" /> Paper trading only
          </span>
        </header>

        <div role="tablist" aria-label="Admin sections" className="flex overflow-x-auto border-b border-border bg-bg/50">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                id={`admin-tab-${tab.key}`}
                role="tab"
                aria-selected={activeTab === tab.key}
                aria-controls="admin-tab-panel"
                tabIndex={activeTab === tab.key ? 0 : -1}
                onClick={() => setActiveTab(tab.key)}
                onKeyDown={(event) => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const currentIndex = TABS.findIndex(({ key }) => key === tab.key);
                  const nextIndex = event.key === 'Home' ? 0
                    : event.key === 'End' ? TABS.length - 1
                      : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
                  const nextTab = TABS[nextIndex].key;
                  setActiveTab(nextTab);
                  document.getElementById(`admin-tab-${nextTab}`)?.focus();
                }}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                  activeTab === tab.key
                    ? 'border-primary text-primary bg-primary/5'
                    : 'border-transparent text-muted hover:text-text hover:bg-surface'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div id="admin-tab-panel" role="tabpanel" aria-labelledby={`admin-tab-${activeTab}`} tabIndex={0} className="p-4 md:p-6 min-h-[420px]">
          {activeTab === 'metrics' && <SystemMetrics />}
          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'models' && <ModelManagement />}
          {activeTab === 'cms' && <CMSManager />}
          {activeTab === 'logs' && <Logs />}
          {activeTab === 'markets' && <MarketAvailabilityPanel />}
          {activeTab === 'events' && <EventBlackoutPanel />}
          {activeTab === 'settings' && <AutonomySettings />}
        </div>
      </div>
    </AdminRoute>
  );
}

function MarketAvailabilityPanel() {
  const [markets, setMarkets] = useState<MarketAvailabilityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    try { setMarkets(await fetchMarketAvailability(true)); setError(false); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const probe = async () => {
    setProbing(true);
    try { setMarkets(await probeMarkets()); setError(false); }
    catch { setError(true); }
    finally { setProbing(false); }
  };
  return <section className="bg-bg/50 border border-border/50 rounded-xl p-4 space-y-4">
    <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Massive USD market availability</h3><p className="text-xs text-muted mt-1">Unknown markets remain available for selection until a provider check confirms they are unavailable.</p></div><div className="flex gap-2"><button type="button" onClick={() => void refresh()} aria-label="Refresh market availability" className="p-2 rounded hover:bg-surface"><RefreshCw className="w-4 h-4 text-muted" /></button><button type="button" onClick={() => void probe()} disabled={probing} className="px-3 py-2 rounded-lg bg-primary text-black text-xs font-semibold disabled:opacity-50">{probing ? 'Checking…' : 'Probe markets'}</button></div></div>
    {error && <p role="alert" className="text-xs text-danger">Market availability could not be loaded or checked.</p>}
    {loading ? <p className="text-xs text-muted">Loading…</p> : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{markets.map((market) => <div key={market.symbol} className="rounded-lg bg-surface border border-border p-3"><div className="flex justify-between gap-2"><strong className="text-xs">{market.symbol}</strong><span className={`text-[10px] uppercase ${market.status === 'available' ? 'text-success' : market.status === 'unavailable' ? 'text-danger' : 'text-muted'}`}>{market.status}</span></div><p className="text-[10px] text-muted mt-1">{market.checkedAt ? `Checked ${new Date(market.checkedAt).toLocaleString()}` : 'Not checked'}</p></div>)}</div>}
  </section>;
}

function EventBlackoutPanel() {
  const [events, setEvents] = useState<EventBlackout[]>([]);
  const [title, setTitle] = useState('');
  const [impact, setImpact] = useState<EventBlackout['impact']>('high');
  const [assetClasses, setAssetClasses] = useState<string[]>(['crypto']);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    try { setEvents(await fetchAdminEventBlackouts()); setMessage(''); }
    catch { setMessage('Event blackout data is unavailable. Apply the event-risk migration before configuring windows.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !assetClasses.length || !startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) return;
    setSaving(true); setMessage('');
    try {
      await createEventBlackout({ title: title.trim(), impact, assetClasses, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() });
      setTitle(''); setStartsAt(''); setEndsAt('');
      setMessage('Blackout window saved and audited.');
      await refresh();
    } catch { setMessage('Could not save the blackout window.'); }
    finally { setSaving(false); }
  };

  const cancel = async (id: string) => {
    setSaving(true); setMessage('');
    try { await cancelEventBlackout(id); setMessage('Blackout window cancelled and audited.'); await refresh(); }
    catch { setMessage('Could not cancel the blackout window.'); }
    finally { setSaving(false); }
  };

  return <section className="space-y-4">
    <div><h3 className="text-sm font-semibold">Manual event blackouts</h3><p className="mt-1 text-xs text-muted">Windows block new entries at or above the configured impact threshold. Existing positions continue to be managed.</p></div>
    <form onSubmit={(event) => void save(event)} className="grid gap-3 rounded-xl border border-border bg-bg/50 p-4 sm:grid-cols-2">
      <label className="text-xs font-medium">Event title<input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} required className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" /></label>
      <label className="text-xs font-medium">Impact<select value={impact} onChange={(event) => setImpact(event.target.value as EventBlackout['impact'])} className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      <fieldset className="sm:col-span-2"><legend className="text-xs font-medium">Asset classes</legend><div className="mt-2 flex flex-wrap gap-3">{['crypto', 'forex', 'commodity', 'index', 'stock'].map((asset) => <label key={asset} className="flex items-center gap-1.5 text-xs capitalize"><input type="checkbox" checked={assetClasses.includes(asset)} onChange={(event) => setAssetClasses((current) => event.target.checked ? [...current, asset] : current.filter((item) => item !== asset))} />{asset}</label>)}</div></fieldset>
      <label className="text-xs font-medium">Starts<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" /></label>
      <label className="text-xs font-medium">Ends<input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" /></label>
      <button type="submit" disabled={saving || !assetClasses.length || !title.trim() || !startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)} className="sm:col-span-2 justify-self-start rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-black disabled:opacity-50">{saving ? 'Saving…' : 'Add blackout window'}</button>
    </form>
    {message && <p role="status" className="text-xs text-muted">{message}</p>}
    {loading ? <p className="text-xs text-muted">Loading blackout windows…</p> : events.length ? <div className="space-y-2">{events.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"><div><strong className="text-sm">{item.title}</strong><p className="mt-1 text-xs text-muted">{item.impact} · {item.asset_classes.join(', ')} · {new Date(item.starts_at).toLocaleString()} – {new Date(item.ends_at).toLocaleString()}</p><span className="text-[10px] uppercase text-muted">{item.active ? 'Active' : 'Cancelled'}</span></div>{item.active && <button type="button" disabled={saving} onClick={() => void cancel(item.id)} className="rounded-lg border border-border px-3 py-2 text-xs hover:border-danger/50 disabled:opacity-50">Cancel window</button>}</article>)}</div> : <p className="rounded-lg bg-bg/60 p-3 text-sm text-muted">No event blackout windows are configured.</p>}
  </section>;
}

function AutonomySettings() {
  const [status, setStatus] = useState<AutonomyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await fetchAutonomyStatus());
      setError(false);
    } catch {
      setStatus(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const updateState = async () => {
    if (!status) return;
    setSaving(true);
    try {
      const active = status.state === 'MONITORING' || status.state === 'DECIDING';
      setStatus(await setAutonomyState(active ? 'pause' : 'start'));
      setError(false);
    } catch {
      setStatus(null);
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const active = status?.state === 'MONITORING' || status?.state === 'DECIDING';
  return (
    <section className="bg-bg/50 border border-border/50 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Autonomous Paper Engine</h3><p className="text-xs text-muted mt-1">Controls the backend paper-trading pipeline. No real-money orders are submitted.</p></div><button type="button" onClick={() => void refresh()} aria-label="Refresh engine status" className="p-2 rounded hover:bg-surface"><RefreshCw className={`w-4 h-4 text-muted ${loading ? 'animate-spin' : ''}`} /></button></div>
      {error && <div role="alert" className="text-xs text-danger">Could not verify engine status. Refresh your sign-in, then retry before changing engine state.</div>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[{ label: 'State', value: loading ? 'Loading…' : status?.state ?? 'Unavailable' }, { label: 'Decisions', value: String(status?.processedDecisions ?? '--') }, { label: 'Paper Orders', value: String(status?.executedOrders ?? '--') }, { label: 'Skipped Runs', value: String(status?.skippedRuns ?? '--') }].map((item) => <div key={item.label} className="rounded-lg bg-surface border border-border p-3"><div className="text-[10px] text-muted">{item.label}</div><div className="text-sm font-semibold mt-1">{item.value}</div></div>)}</div>
      {status?.lastError && <p className="text-xs text-warning">Latest engine error: {status.lastError}</p>}
      <button type="button" disabled={!status || saving || loading || error} onClick={() => void updateState()} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-black text-xs font-semibold disabled:opacity-50">{saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}{saving ? 'Updating…' : active ? 'Pause paper engine' : 'Start paper engine'}</button>
    </section>
  );
}
