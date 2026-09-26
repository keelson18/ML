import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Sun, Moon, LogOut, Wifi, WifiOff, TrendingUp, TrendingDown,
  Menu,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { TRACKED_PAIRS, TIMEFRAMES, MARKET_TYPES, type Candle, type Timeframe, type Signal, type Recommendation, type MLPrediction, type MarketType, type CMSContent } from '../lib/types';
import { getDataProvider } from '../lib/providers';
import { riskLevels } from '../lib/strategies';
import { runAllStrategies } from '../lib/strategies/index';
import { combineSignals } from '../lib/backtest';
import { fetchMLPrediction, fetchCachedMLPrediction } from '../lib/mlClient';
import AdminPanel from './AdminPanel';
import CMSManager from './CMS/CMSManager';
import CMSViewer from './CMS/CMSViewer';
import Sidebar from './Sidebar';
import { pathForSidebarTab, sidebarTabFromPath, type SidebarTab } from '../lib/routes';
import { getMarketsByType } from '../lib/markets';
import { fetchPublishedContent } from '../lib/cms';
import MarketsPage from './pages/MarketsPage';
import AIAnalysis from './pages/AIAnalysis';
import StrategyLab from './pages/StrategyLab';
import PortfolioPage from './pages/PortfolioPage';
import BacktestingCenter from './pages/BacktestingCenter';
import WatchlistsPage from './pages/WatchlistsPage';
import AlertsPage from './pages/AlertsPage';
import NewsPage from './pages/NewsPage';
import RiskManagement from './pages/RiskManagement';
import AILearning from './pages/AILearning';
import MultiTimeframeTerminal from './MultiTimeframeTerminal';
import AutonomousCommandCenter from './AutonomousCommandCenter';
import { requestBackendDecision, type BackendDecision } from '../lib/backend-api';

type WsStatus = 'connecting' | 'open' | 'closed' | 'reconnecting';

export default function Dashboard() {
  const { user, profile, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(() => sidebarTabFromPath(window.location.pathname));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [marketType, setMarketType] = useState<MarketType>('crypto');
  const [symbol, setSymbol] = useState<string>('BTCUSDT');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [serverDecision, setServerDecision] = useState<BackendDecision | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [ml, setMl] = useState<MLPrediction | null>(null);
  const [mlLoading, setMlLoading] = useState(false);
  const [mlStatus, setMlStatus] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const candlesRef = useRef<Candle[]>([]);

  const isAdmin = profile?.role === 'admin';
  const navigateToTab = (tab: SidebarTab, replace = false) => {
    const nextTab = tab === 'admin' && !isAdmin ? 'dashboard' : tab;
    const path = pathForSidebarTab(nextTab);
    if (window.location.pathname !== path) {
      window.history[replace ? 'replaceState' : 'pushState']({}, '', path);
    }
    setSidebarTab(nextTab);
    setMobileSidebarOpen(false);
  };

  useEffect(() => {
    const handlePopState = () => setSidebarTab(sidebarTabFromPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    const requestedTab = sidebarTabFromPath(window.location.pathname);
    if ((requestedTab === 'admin' && profile && !isAdmin) || (requestedTab === 'dashboard' && window.location.pathname !== '/')) {
      window.history.replaceState({}, '', pathForSidebarTab('dashboard'));
      setSidebarTab('dashboard');
    }
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isAdmin, profile]);

  const availableMarkets = useMemo(() => getMarketsByType(marketType), [marketType]);
  const dataProvider = useMemo(() => getDataProvider(marketType), [marketType]);

  // Keep a ref of latest candles so the kline update callback can merge without stale state.
  useEffect(() => { candlesRef.current = candles; }, [candles]);

  // Load historical candles + subscribe to live kline stream.
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setCandles([]);
    setLivePrice(null);
    setDataError(null);
    setWsStatus('connecting');
    setMl(null);
    setMlStatus('idle');

    (async () => {
      try {
        const data = await dataProvider.fetchKlines(symbol, timeframe, 1000);
        if (disposed) return;
        setCandles(data);
        setLivePrice(data.length ? data[data.length - 1].close : null);
      } catch (error) {
        if (!disposed) {
          setCandles([]);
          setDataError(error instanceof Error ? error.message : 'Market data could not be loaded.');
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    })();

    const unsub = dataProvider.subscribeKlines(symbol, timeframe, (candle) => {
      setCandles((prev) => {
        const arr = [...prev];
        const last = arr[arr.length - 1];
        if (last && last.time === candle.time) {
          arr[arr.length - 1] = candle;
        } else if (!last || candle.time > last.time) {
          arr.push(candle);
          if (arr.length > 1500) arr.shift();
        }
        return arr;
      });
      setLivePrice(candle.close);
    }, (status) => setWsStatus(status));

    return () => { disposed = true; unsub(); };
  }, [dataProvider, symbol, timeframe, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    setServerDecision(null);
    if (candles.length < 60) return () => { cancelled = true; };
    requestBackendDecision(symbol, timeframe, candles)
      .then((decision) => { if (!cancelled) setServerDecision(decision); })
      .catch(() => { if (!cancelled) setServerDecision(null); });
    return () => { cancelled = true; };
  }, [candles, symbol, timeframe]);

  // Fetch cached ML prediction instantly, then request a fresh one.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await fetchCachedMLPrediction(symbol, timeframe);
      if (!cancelled && cached) {
        setMl(cached);
        setMlStatus('ready');
      }
      if (candles.length >= 60) {
        if (!cancelled) setMlStatus('loading');
        const fresh = await fetchMLPrediction(symbol, timeframe);
        if (!cancelled) {
          if (fresh) {
            setMl(fresh);
            setMlStatus('ready');
          } else if (!cached) {
            setMlStatus('unavailable');
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [symbol, timeframe, candles.length]);

  const refreshML = async () => {
    setMlLoading(true);
    const pred = await fetchMLPrediction(symbol, timeframe);
    if (pred) {
      setMl(pred);
      setMlStatus('ready');
    } else {
      setMlStatus('unavailable');
    }
    setMlLoading(false);
  };

  // Run strategies + compute recommendation.
  const { signals, recommendation, risk } = useMemo(() => {
    if (candles.length < 60) return { signals: [] as Signal[], recommendation: null as Recommendation | null, risk: null };
    const sigs = runAllStrategies(candles, timeframe);
    const rec = combineSignals(sigs, ml, candles, symbol, timeframe);
    const r = riskLevels(candles);
    return { signals: sigs, recommendation: rec, risk: r };
  }, [candles, ml, symbol, timeframe]);

  // Collect all overlays from signals for the chart.
  const overlays = useMemo(() => {
    const all = signals.flatMap((s) => s.overlays ?? []);
    if (recommendation?.stopLoss && recommendation?.takeProfit && recommendation.entry) {
      all.push({ type: 'hline' as const, id: 'sl', price: recommendation.stopLoss, color: '#ef4444', label: 'SL' });
      all.push({ type: 'hline' as const, id: 'tp', price: recommendation.takeProfit, color: '#22c55e', label: 'TP' });
      all.push({ type: 'hline' as const, id: 'entry', price: recommendation.entry, color: '#10a37f', label: 'Entry' });
    }
    return all;
  }, [signals, recommendation]);

  const priceChange = useMemo(() => {
    if (candles.length < 2) return null;
    const first = candles[Math.max(0, candles.length - 24)].close;
    const last = candles[candles.length - 1].close;
    return ((last - first) / first) * 100;
  }, [candles]);

  // Render the appropriate page content based on sidebar tab
  const renderContent = () => {
    // Admin panel
    if (sidebarTab === 'admin' && isAdmin) {
      return (
        <div className="p-4 lg:p-6">
          <AdminPanel />
        </div>
      );
    }

    // CMS / Knowledge Base — role-aware: admin gets full editor, others get read-only article list
    if (sidebarTab === 'cms') {
      return (
        <div className="p-4 lg:p-6">
          {isAdmin ? <CMSManager /> : <PublishedArticles />}
        </div>
      );
    }

    // Settings tab — profile/theme/notifications panel
    if (sidebarTab === 'settings') {
      return (
        <div className="p-4 lg:p-6 max-w-2xl">
          <h2 className="text-sm font-semibold mb-4">Settings</h2>
          <div className="bg-surface border border-border rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Theme</div>
                <div className="text-xs text-muted">Toggle between light and dark mode</div>
              </div>
              <button
                onClick={toggle}
                className="px-3 py-1.5 rounded-lg bg-bg border border-border text-xs font-medium hover:bg-surface transition-colors"
              >
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </button>
            </div>
            <div className="border-t border-border/50 pt-4">
              <div className="text-sm font-medium mb-1">Account</div>
              <div className="text-xs text-muted">{user?.email}</div>
              <div className="text-xs text-muted mt-1">Role: {profile?.role ?? 'user'}</div>
            </div>
            <div className="border-t border-border/50 pt-4">
              <div className="text-sm font-medium mb-1">Notifications</div>
              <div className="text-xs text-muted">Notification preferences coming soon.</div>
            </div>
          </div>
        </div>
      );
    }

    // Markets tab — dedicated market overview with all market types
    if (sidebarTab === 'markets') {
      return <MarketsPage />;
    }

    // Trading Terminal — advanced chart for active trading
    if (sidebarTab === 'terminal') {
      return (
        <div className="p-4 lg:p-6">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)}
              className="px-3 py-2 rounded-lg bg-surface border border-border text-text focus:outline-none focus:border-primary text-sm">
              {availableMarkets.map((p) => <option key={p.symbol} value={p.symbol}>{p.label}</option>)}
            </select>
            <div className="flex items-center gap-1 px-3 py-2 rounded-lg bg-surface border border-border text-xs text-muted">
              <span className="text-text font-medium">1D</span><span>·</span><span>4H</span><span>·</span><span>15M</span><span>·</span><span>5M</span>
            </div>
            <span className="text-lg font-semibold tabular-nums ml-auto">${livePrice?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '--'}</span>
          </div>
          <div className="bg-surface border border-border rounded-xl overflow-hidden h-[600px] relative">
            <MultiTimeframeTerminal symbol={symbol} marketType={marketType} theme={theme} wsStatus={wsStatus} />
          </div>
        </div>
      );
    }

    // AI Analysis panel
    if (sidebarTab === 'ai-analysis') {
      return <AIAnalysis signals={signals} ml={ml} mlStatus={mlStatus} recommendation={recommendation} onRefreshML={refreshML} mlLoading={mlLoading} />;
    }

    // Strategy Lab
    if (sidebarTab === 'strategies') {
      return <StrategyLab signals={signals} candles={candles} timeframe={timeframe} />;
    }

    // Portfolio page
    if (sidebarTab === 'portfolio') {
      return <PortfolioPage />;
    }

    // Backtesting Center
    if (sidebarTab === 'backtesting') {
      return <BacktestingCenter candles={candles} timeframe={timeframe} symbol={symbol} theme={theme} />;
    }

    // Watchlists
    if (sidebarTab === 'watchlists') {
      return <WatchlistsPage userId={user?.id} />;
    }

    // Alerts
    if (sidebarTab === 'alerts') {
      return <AlertsPage userId={user?.id} />;
    }

    // News & Sentiment
    if (sidebarTab === 'news') {
      return <NewsPage />;
    }

    // Risk Management
    if (sidebarTab === 'risk') {
      return <RiskManagement />;
    }

    // AI Learning Center
    if (sidebarTab === 'ai-learning') {
      return <AILearning />;
    }

// Default: Dashboard
    return (
      <div className="dashboard-home">
        {/* Controls */}
        <div className="dashboard-toolbar">
          <div className="dashboard-toolbar-title"><span className="page-eyebrow">LIVE OVERSIGHT</span><h1>Autonomous desk</h1><p>Market intelligence, evidence, and paper execution in one view.</p></div>
          {/* Market Type Selector */}
          <select
            value={marketType}
            onChange={(e) => {
              const newType = e.target.value as MarketType;
              setMarketType(newType);
              const markets = getMarketsByType(newType);
              if (markets.length > 0 && !markets.find((m) => m.symbol === symbol)) {
                setSymbol(markets[0].symbol);
              }
            }}
            className="px-3 py-2 rounded-lg bg-surface border border-border text-text focus:outline-none focus:border-primary text-sm"
          >
            {MARKET_TYPES.map((mt) => (
              <option key={mt.value} value={mt.value}>{mt.icon} {mt.label}</option>
            ))}
          </select>

          {/* Symbol Selector */}
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="px-3 py-2 rounded-lg bg-surface border border-border text-text focus:outline-none focus:border-primary text-sm"
          >
            {availableMarkets.length > 0
              ? availableMarkets.map((p) => <option key={p.symbol} value={p.symbol}>{p.label}</option>)
              : TRACKED_PAIRS.map((p) => <option key={p.symbol} value={p.symbol}>{p.label}</option>)
            }
          </select>

          {/* Timeframe Selector */}
          <div className="flex gap-1 p-1 rounded-lg bg-surface border border-border">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setTimeframe(tf.value)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  timeframe === tf.value ? 'bg-primary text-black' : 'text-muted hover:text-text'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {livePrice && (
            <div className="dashboard-price-block">
              <span className="text-lg font-semibold tabular-nums">${livePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              {priceChange !== null && (
                <span className={`text-sm flex items-center gap-0.5 ${priceChange >= 0 ? 'text-success' : 'text-danger'}`}>
                  {priceChange >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {Math.abs(priceChange).toFixed(2)}%
                </span>
              )}
            </div>
          )}

        </div>

        {dataError && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning" role="alert">
            <span>Market data unavailable: {dataError}</span>
            <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="rounded border border-warning/40 px-2 py-1 font-medium hover:bg-warning/10">Retry</button>
          </div>
        )}
        <AutonomousCommandCenter symbol={symbol} timeframe={timeframe} marketType={marketType} wsStatus={wsStatus} candles={candles} overlays={overlays} recommendation={recommendation} serverDecision={serverDecision} signals={signals} markets={availableMarkets} onSymbolChange={setSymbol} theme={theme} risk={risk} livePrice={livePrice} loading={loading} />
      </div>
    );
  };

  return (
    <div className="h-full flex bg-bg text-text">
      {/* Sidebar */}
      <Sidebar
        activeTab={sidebarTab}
        onTabChange={navigateToTab}
        isAdmin={isAdmin}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onToggle={() => {
          if (window.matchMedia('(max-width: 700px)').matches) setMobileSidebarOpen((open) => !open);
          else setSidebarCollapsed((collapsed) => !collapsed);
        }}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-border bg-bg/95 backdrop-blur flex items-center justify-between px-4 lg:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileSidebarOpen((open) => !open)}
              className="p-1.5 rounded-lg hover:bg-surface transition-colors text-muted hover:text-text lg:hidden"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                <Activity className="w-4 h-4 text-primary" />
              </div>
              <span className="font-semibold tracking-tight hidden sm:inline">Quantum Intelligence</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <WsIndicator status={wsStatus} />
            <button onClick={toggle} className="p-2 rounded-lg hover:bg-surface transition-colors" title="Toggle theme">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <div className="hidden sm:block text-xs text-muted">{user?.email}</div>
            <button onClick={signOut} className="p-2 rounded-lg hover:bg-surface transition-colors" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

// ---- Sub-components ----

function WsIndicator({ status }: { status: WsStatus }) {
  const map: Record<WsStatus, { color: string; icon: typeof Wifi; label: string }> = {
    open: { color: 'text-success', icon: Wifi, label: 'Live' },
    connecting: { color: 'text-warning', icon: Wifi, label: 'Connecting' },
    reconnecting: { color: 'text-warning', icon: WifiOff, label: 'Reconnecting' },
    closed: { color: 'text-danger', icon: WifiOff, label: 'Disconnected' },
  };
  const { color, icon: Icon, label } = map[status];
  return (
    <div className={`flex items-center gap-1.5 text-xs ${color}`} title={label}>
      <Icon className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}

// Published articles list — shown to non-admin users under the CMS/knowledge-base tab.
// Fetches only published content via the read_published_cms RLS policy.
function PublishedArticles() {
  const [articles, setArticles] = useState<CMSContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchPublishedContent();
      if (!cancelled) { setArticles(data); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div className="text-sm text-muted text-center py-12">Loading articles…</div>;
  }

  // If an article is selected, show CMSViewer for that slug
  if (selectedSlug) {
    return <CMSViewer slug={selectedSlug} onBack={() => setSelectedSlug(null)} />;
  }

  if (articles.length === 0) {
    return <div className="text-sm text-muted text-center py-12">No published articles yet.</div>;
  }

  return (
    <div className="animate-fade-in space-y-3">
      <h2 className="text-sm font-semibold mb-4">Knowledge Base</h2>
      {articles.map((a) => (
        <button
          key={a.id}
          onClick={() => setSelectedSlug(a.slug)}
          className="w-full text-left bg-surface border border-border rounded-xl p-4 hover:border-primary/30 transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary capitalize">{a.contentType}</span>
            {a.tags.map((t: string) => (
              <span key={t} className="text-[10px] text-muted">#{t}</span>
            ))}
          </div>
          <div className="text-sm font-medium">{a.title}</div>
          {a.excerpt && <div className="text-xs text-muted mt-1 line-clamp-2">{a.excerpt}</div>}
          {a.publishedAt && (
            <div className="text-[10px] text-muted mt-2">{new Date(a.publishedAt).toLocaleDateString()}</div>
          )}
        </button>
      ))}
    </div>
  );
}
