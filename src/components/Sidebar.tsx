import { Activity, BarChart3, Shield, BookOpen, Settings, PanelLeftClose, PanelLeftOpen, TrendingUp, Brain, Zap, Briefcase, History, Star, Bell, Newspaper, AlertTriangle, X } from 'lucide-react';
import type { SidebarTab } from '../lib/routes';
export type { SidebarTab } from '../lib/routes';

interface Props {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  isAdmin: boolean;
  collapsed?: boolean;
  mobileOpen?: boolean;
  onToggle?: () => void;
}

const NAV_ITEMS: { key: SidebarTab; label: string; icon: typeof Activity; adminOnly?: boolean }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: Activity },
  { key: 'markets', label: 'Markets', icon: BarChart3 },
  { key: 'terminal', label: 'Trading Terminal', icon: TrendingUp },
  { key: 'ai-analysis', label: 'AI Analysis', icon: Brain },
  { key: 'strategies', label: 'Strategies', icon: Zap },
  { key: 'portfolio', label: 'Portfolio', icon: Briefcase },
  { key: 'backtesting', label: 'Backtesting', icon: History },
  { key: 'watchlists', label: 'Watchlists', icon: Star },
  { key: 'alerts', label: 'Alerts', icon: Bell },
  { key: 'news', label: 'News', icon: Newspaper },
  { key: 'risk', label: 'Risk Management', icon: AlertTriangle },
  { key: 'ai-learning', label: 'AI Learning', icon: Brain },
  { key: 'admin', label: 'Admin Panel', icon: Shield, adminOnly: true },
  { key: 'cms', label: 'Knowledge Base', icon: BookOpen },
  { key: 'settings', label: 'Settings', icon: Settings },
];

const NAV_GROUPS = [
  { label: 'Operate', keys: ['dashboard', 'markets', 'terminal', 'portfolio', 'watchlists'] as SidebarTab[] },
  { label: 'Research', keys: ['ai-analysis', 'strategies', 'backtesting', 'news', 'ai-learning'] as SidebarTab[] },
  { label: 'Control', keys: ['alerts', 'risk', 'admin', 'cms', 'settings'] as SidebarTab[] },
];

export default function Sidebar({ activeTab, onTabChange, isAdmin, collapsed, mobileOpen = false, onToggle }: Props) {
  return (
    <aside className={`app-sidebar ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}>
      <div className="sidebar-brand">
        {!collapsed && <div className="flex items-center gap-2 min-w-0"><div className="sidebar-mark"><Activity className="w-3.5 h-3.5 text-primary" /></div><span className="sidebar-wordmark">Quantum <small>INTELLIGENCE</small></span></div>}
        {collapsed && <div className="w-full flex justify-center"><div className="sidebar-mark"><Activity className="w-3.5 h-3.5 text-primary" /></div></div>}
        {onToggle && <button onClick={onToggle} className="sidebar-toggle" title={mobileOpen ? 'Close navigation' : collapsed ? 'Expand navigation' : 'Collapse navigation'}>{mobileOpen ? <X className="w-4 h-4" /> : collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}</button>}
      </div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => <div className="sidebar-group" key={group.label}>
          {!collapsed && <div className="sidebar-group-label">{group.label}</div>}
          {NAV_ITEMS.filter((item) => group.keys.includes(item.key) && (!item.adminOnly || isAdmin)).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return <button key={item.key} onClick={() => onTabChange(item.key)} className={`sidebar-link ${isActive ? 'is-active' : ''} ${collapsed ? 'is-icon-only' : ''}`} title={collapsed ? item.label : undefined} aria-current={isActive ? 'page' : undefined}>
              <Icon className="sidebar-link-icon" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>;
          })}
        </div>)}
      </nav>

      {!collapsed && <div className="sidebar-footer"><div className="sidebar-system"><span /> SYSTEM NOMINAL</div><p>Quantum Intelligence <b>v2.0</b></p></div>}
    </aside>
  );
}
