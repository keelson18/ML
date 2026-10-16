import { Activity, BarChart3, Shield, BookOpen, Settings, TrendingUp, Brain, Zap, Briefcase, History, Star, Bell, Newspaper, AlertTriangle, ClipboardList, LogOut } from 'lucide-react';
import type { SidebarTab } from '../lib/routes';
export type { SidebarTab } from '../lib/routes';

interface Props {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  isAdmin: boolean;
  onSignOut: () => void;
}

const NAV_ITEMS: { key: SidebarTab; label: string; icon: typeof Activity; adminOnly?: boolean }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: Activity },
  { key: 'trader-desk', label: 'Trader Desk', icon: ClipboardList },
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
  { label: 'Operate', keys: ['dashboard', 'trader-desk', 'markets', 'terminal', 'portfolio', 'watchlists'] as SidebarTab[] },
  { label: 'Research', keys: ['ai-analysis', 'strategies', 'backtesting', 'news', 'ai-learning'] as SidebarTab[] },
  { label: 'Control', keys: ['alerts', 'risk', 'admin', 'cms', 'settings'] as SidebarTab[] },
];

export default function Sidebar({ activeTab, onTabChange, isAdmin, onSignOut }: Props) {
  return (
    <aside id="app-navigation" className="app-sidebar">
      <div className="sidebar-brand">
        <div className="flex items-center gap-2 min-w-0"><div className="sidebar-mark"><Activity className="w-3.5 h-3.5 text-primary" /></div><span className="sidebar-wordmark">Quantum <small>INTELLIGENCE</small></span></div>
      </div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => <div className="sidebar-group" key={group.label}>
          <div className="sidebar-group-label">{group.label}</div>
          {NAV_ITEMS.filter((item) => group.keys.includes(item.key) && (!item.adminOnly || isAdmin)).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return <button key={item.key} type="button" onClick={() => onTabChange(item.key)} className={isActive ? 'sidebar-link is-active' : 'sidebar-link'} aria-current={isActive ? 'page' : undefined}>
              <Icon className="sidebar-link-icon" />
              <span className="truncate">{item.label}</span>
            </button>;
          })}
        </div>)}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-system"><span /> SYSTEM NOMINAL</div>
        <button type="button" onClick={onSignOut} className="sidebar-sign-out"><LogOut aria-hidden="true" /><span>Sign out</span></button>
        <p>Quantum Intelligence <b>v2.0</b></p>
      </div>
    </aside>
  );
}
