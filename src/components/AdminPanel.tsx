import { useCallback, useEffect, useState } from 'react';
import { Shield, Activity, Users, Brain, BookOpen, FileText, Settings, Play, Pause, RefreshCw } from 'lucide-react';
import { fetchAutonomyStatus, setAutonomyState, type AutonomyStatus } from '../lib/backend-api';
import AdminRoute from './AdminRoute';
import SystemMetrics from './Admin/SystemMetrics';
import UserManagement from './Admin/UserManagement';
import ModelManagement from './Admin/ModelManagement';
import CMSManager from './CMS/CMSManager';
import Logs from './Admin/Logs';

type AdminTab = 'metrics' | 'users' | 'models' | 'cms' | 'logs' | 'settings';

const TABS: { key: AdminTab; label: string; icon: typeof Activity }[] = [
  { key: 'metrics', label: 'System Metrics', icon: Activity },
  { key: 'users', label: 'User Management', icon: Users },
  { key: 'models', label: 'ML Models', icon: Brain },
  { key: 'cms', label: 'Content (CMS)', icon: BookOpen },
  { key: 'logs', label: 'System Logs', icon: FileText },
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
          {activeTab === 'settings' && <AutonomySettings />}
        </div>
      </div>
    </AdminRoute>
  );
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
