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
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary" />
          </div>
          <span className="font-semibold text-sm">Admin Panel</span>
        </div>

        {/* Tab navigation */}
        <div className="flex overflow-x-auto border-b border-border bg-bg/50">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
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

        {/* Tab content */}
        <div className="p-4">
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
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const active = status?.state === 'MONITORING' || status?.state === 'DECIDING';
  return (
    <section className="bg-bg/50 border border-border/50 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Autonomous Paper Engine</h3><p className="text-xs text-muted mt-1">Controls the backend paper-trading pipeline. No real-money orders are submitted.</p></div><button type="button" onClick={() => void refresh()} aria-label="Refresh engine status" className="p-2 rounded hover:bg-surface"><RefreshCw className={`w-4 h-4 text-muted ${loading ? 'animate-spin' : ''}`} /></button></div>
      {error && <div role="alert" className="text-xs text-danger">Could not reach the autonomy service. Verify that the backend is running and your account is an admin.</div>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[{ label: 'State', value: loading ? 'Loading…' : status?.state ?? 'Unavailable' }, { label: 'Decisions', value: String(status?.processedDecisions ?? '--') }, { label: 'Paper Orders', value: String(status?.executedOrders ?? '--') }, { label: 'Skipped Runs', value: String(status?.skippedRuns ?? '--') }].map((item) => <div key={item.label} className="rounded-lg bg-surface border border-border p-3"><div className="text-[10px] text-muted">{item.label}</div><div className="text-sm font-semibold mt-1">{item.value}</div></div>)}</div>
      {status?.lastError && <p className="text-xs text-warning">Latest engine error: {status.lastError}</p>}
      <button type="button" disabled={!status || saving || loading} onClick={() => void updateState()} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-black text-xs font-semibold disabled:opacity-50">{saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}{saving ? 'Updating…' : active ? 'Pause paper engine' : 'Start paper engine'}</button>
    </section>
  );
}
