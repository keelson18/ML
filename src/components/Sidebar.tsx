import { Activity, BarChart3, Shield, BookOpen, Settings, X, TrendingUp, Brain, Zap, Briefcase, History, Star, Bell, Newspaper, AlertTriangle } from 'lucide-react';

export type SidebarTab = 'dashboard' | 'markets' | 'terminal' | 'ai-analysis' | 'strategies' | 'portfolio' | 'backtesting' | 'watchlists' | 'alerts' | 'news' | 'risk' | 'ai-learning' | 'admin' | 'cms' | 'settings';

interface Props {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  isAdmin: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
}

const NAV_SECTIONS: { label: string; items: { key: SidebarTab; label: string; icon: typeof Activity; adminOnly?: boolean }[] }[] = [
  {
    label: 'Overview',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: Activity },
      { key: 'markets', label: 'Markets', icon: BarChart3 },
      { key: 'terminal', label: 'Terminal', icon: TrendingUp },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { key: 'ai-analysis', label: 'AI Analysis', icon: Brain },
      { key: 'strategies', label: 'Strategies', icon: Zap },
      { key: 'ai-learning', label: 'AI Learning', icon: Brain },
    ],
  },
  {
    label: 'Trading',
    items: [
      { key: 'portfolio', label: 'Portfolio', icon: Briefcase },
      { key: 'backtesting', label: 'Backtesting', icon: History },
      { key: 'watchlists', label: 'Watchlists', icon: Star },
      { key: 'alerts', label: 'Alerts', icon: Bell },
    ],
  },
  {
    label: 'Resources',
    items: [
      { key: 'news', label: 'News', icon: Newspaper },
      { key: 'risk', label: 'Risk Management', icon: AlertTriangle },
      { key: 'cms', label: 'Knowledge Base', icon: BookOpen },
      { key: 'admin', label: 'Admin Panel', icon: Shield, adminOnly: true },
      { key: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function Sidebar({ activeTab, onTabChange, isAdmin, collapsed, onToggle }: Props) {
  return (
    <aside className={`${collapsed ? 'w-16' : 'w-60'} bg-surface border-r border-border flex flex-col transition-all duration-300 shrink-0`}>
      {/* Logo */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-border">
        {!collapsed ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Activity className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-sm font-semibold tracking-tight truncate">Quantum</span>
          </div>
        ) : (
          <div className="w-full flex justify-center">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Activity className="w-3.5 h-3.5 text-primary" />
            </div>
          </div>
        )}
        {onToggle && (
          <button onClick={onToggle} className="p-1 rounded-md hover:bg-bg transition-colors text-muted hover:text-text lg:hidden">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-3 overflow-y-auto">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter((item) => !item.adminOnly || isAdmin);
          if (visibleItems.length === 0) return null;
          return (
            <div key={section.label} className="mb-4">
              {!collapsed && (
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted/60 px-2.5 mb-1.5">
                  {section.label}
                </div>
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => onTabChange(item.key)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                        isActive
                          ? 'bg-primary/8 text-primary'
                          : 'text-muted hover:text-text hover:bg-bg/60'
                      }`}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-primary' : ''}`} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-border">
          <p className="text-[10px] text-muted/60 font-medium">Quantum Intelligence v2.0</p>
        </div>
      )}
    </aside>
  );
}
