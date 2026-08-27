import { Bell, Plus } from 'lucide-react';

export default function AlertsPage() {
  return (
    <div className="p-4 lg:p-6 space-y-6">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Bell className="w-4 h-4 text-primary" /> Alerts
      </h2>

      <div className="flex items-center gap-2 mb-4">
        <button className="px-3 py-1.5 rounded-lg bg-primary text-black text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1">
          <Plus className="w-3 h-3" /> Create Alert
        </button>
      </div>

      <div className="bg-surface border border-border rounded-xl p-4">
        <h3 className="text-xs font-medium text-muted mb-3">Active Alerts</h3>
        <div className="text-xs text-muted text-center py-8">No alerts configured.</div>
      </div>
    </div>
  );
}
