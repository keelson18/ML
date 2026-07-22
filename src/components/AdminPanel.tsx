import { useState } from 'react';
import { Shield, Activity, Users, Brain, BookOpen, FileText, BarChart3, Settings } from 'lucide-react';
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
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
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
          {activeTab === 'settings' && (
            <div className="text-sm text-muted p-4 text-center">
              Settings panel — configure system parameters and preferences.
            </div>
          )}
        </div>
      </div>
    </AdminRoute>
  );
}

