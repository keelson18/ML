import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Activity, AlertTriangle, BarChart3, Bell, BookOpen, Brain, Briefcase, Check, ClipboardList, History, Newspaper, Settings, Shield, Star, TrendingUp, X, Zap, LogOut } from 'lucide-react';
import type { SidebarTab } from '../lib/routes';

const PRIMARY: { tab: SidebarTab; label: string; icon: typeof Activity }[] = [
  { tab: 'dashboard', label: 'Chart', icon: Activity },
  { tab: 'trader-desk', label: 'Trader', icon: ClipboardList },
  { tab: 'portfolio', label: 'Portfolio', icon: Briefcase },
  { tab: 'ai-learning', label: 'Research', icon: Brain },
];

const MORE: { tab: SidebarTab; label: string; icon: typeof Activity; adminOnly?: boolean }[] = [
  { tab: 'terminal', label: 'Trading Terminal', icon: TrendingUp },
  { tab: 'markets', label: 'Markets', icon: BarChart3 },
  { tab: 'ai-analysis', label: 'AI Analysis', icon: Brain },
  { tab: 'strategies', label: 'Strategies', icon: Zap },
  { tab: 'backtesting', label: 'Backtesting', icon: History },
  { tab: 'watchlists', label: 'Watchlists', icon: Star },
  { tab: 'alerts', label: 'Alerts', icon: Bell },
  { tab: 'news', label: 'News & Research', icon: Newspaper },
  { tab: 'risk', label: 'Risk Management', icon: AlertTriangle },
  { tab: 'cms', label: 'Knowledge Base', icon: BookOpen },
  { tab: 'settings', label: 'Settings', icon: Settings },
  { tab: 'admin', label: 'Admin', icon: Shield, adminOnly: true },
];

interface Props {
  activeTab: SidebarTab;
  isAdmin: boolean;
  onNavigate: (tab: SidebarTab) => void;
  onSignOut: () => void;
}

export default function MobileNavigation({ activeTab, isAdmin, onNavigate, onSignOut }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreActive = MORE.some((item) => item.tab === activeTab && (!item.adminOnly || isAdmin));

  useEffect(() => {
    if (moreOpen) sheetRef.current?.querySelector<HTMLButtonElement>('[data-sheet-close]')?.focus();
  }, [moreOpen]);

  const closeMore = () => { setMoreOpen(false); moreButtonRef.current?.focus(); };

  const onSheetKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); closeMore(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...(sheetRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const navigate = (tab: SidebarTab) => { setMoreOpen(false); onNavigate(tab); };
  return <>
    <nav className="mobile-tab-bar" aria-label="Primary navigation">
      {PRIMARY.map(({ tab, label, icon: Icon }) => <button key={tab} type="button" onClick={() => navigate(tab)} aria-current={activeTab === tab ? 'page' : undefined} className={activeTab === tab ? 'mobile-tab is-active' : 'mobile-tab'}>
        <Icon aria-hidden="true" /><span>{label}</span>{activeTab === tab && <span className="sr-only">Current page</span>}
      </button>)}
      <button ref={moreButtonRef} type="button" onClick={() => setMoreOpen(true)} aria-expanded={moreOpen} aria-haspopup="dialog" aria-current={moreActive ? 'page' : undefined} className={moreActive ? 'mobile-tab is-active' : 'mobile-tab'}>
        <span className="mobile-more-icon"><span /><span /><span /></span><span>More</span>
      </button>
    </nav>
    {moreOpen && <div className="mobile-more-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeMore(); }}>
      <div ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="mobile-more-title" className="mobile-more-sheet" onKeyDown={onSheetKeyDown}>
        <header><div className="mobile-more-heading"><span className="mobile-more-mark"><Activity aria-hidden="true" /></span><div><p>YOUR WORKSPACE</p><h2 id="mobile-more-title">Explore</h2></div></div><button data-sheet-close type="button" onClick={closeMore} aria-label="Close More menu"><X aria-hidden="true" /></button></header>
        <nav aria-label="More pages">{MORE.filter((item) => !item.adminOnly || isAdmin).map(({ tab, label, icon: Icon }) => <button key={tab} type="button" onClick={() => navigate(tab)} aria-current={activeTab === tab ? 'page' : undefined} className={activeTab === tab ? 'mobile-more-link is-active' : 'mobile-more-link'}><Icon aria-hidden="true" /><span>{label}</span>{activeTab === tab && <Check className="mobile-more-check" aria-hidden="true" />}</button>)}</nav>
        <button type="button" onClick={onSignOut} className="mobile-sign-out"><LogOut aria-hidden="true" /><span>Sign out</span></button>
      </div>
    </div>}
  </>;
}
