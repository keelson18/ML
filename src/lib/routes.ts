export type SidebarTab = 'dashboard' | 'markets' | 'terminal' | 'ai-analysis' | 'strategies' | 'portfolio' | 'backtesting' | 'watchlists' | 'alerts' | 'news' | 'risk' | 'ai-learning' | 'admin' | 'cms' | 'settings';

export const SIDEBAR_PATHS: Record<SidebarTab, string> = {
  dashboard: '/',
  markets: '/markets',
  terminal: '/terminal',
  'ai-analysis': '/ai-analysis',
  strategies: '/strategies',
  portfolio: '/portfolio',
  backtesting: '/backtesting',
  watchlists: '/watchlists',
  alerts: '/alerts',
  news: '/news',
  risk: '/risk',
  'ai-learning': '/ai-learning',
  admin: '/admin',
  cms: '/knowledge-base',
  settings: '/settings',
};

export function sidebarTabFromPath(pathname: string): SidebarTab {
  const match = (Object.entries(SIDEBAR_PATHS) as [SidebarTab, string][]).find(([, path]) => path === pathname);
  return match?.[0] ?? 'dashboard';
}

export function pathForSidebarTab(tab: SidebarTab): string {
  return SIDEBAR_PATHS[tab];
}
