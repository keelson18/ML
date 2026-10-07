import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Sun, Moon, Wifi, WifiOff, TrendingUp, TrendingDown,
  Menu, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { TIMEFRAMES, MARKET_TYPES, type Candle, type Timeframe, type Signal, type Recommendation, type MLPrediction, type MarketType, type CMSContent } from '../lib/types';
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
import { formatMarketPrice, getDefaultMarketSymbol, getMarketsByType, setMarketAvailability } from '../lib/markets';
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
import SettingsPage from './pages/SettingsPage';
import TraderDesk from './pages/TraderDesk';
import MultiTimeframeTerminal from './MultiTimeframeTerminal';
import AutonomousCommandCenter from './AutonomousCommandCenter';
import { fetchMarketAvailability, requestBackendDecision, type BackendDecision } from '../lib/backend-api';
import { resolveAvatarUrl } from '../lib/avatar';

type WsStatus = 'connecting' | 'open' | 'closed' | 'reconnecting';

export default function Dashboard() {
  const { user, profile, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(() => sidebarTabFromPath(window.location.pathname));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [marketType, setMarketType] = useState<MarketType>('crypto');
  const [symbol, setSymbol] = useState<string>(getDefaultMarketSymbol());
  const [availabilityRevision, setAvailabilityRevision] = useState(0);
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [decisionCandles, setDecisionCandles] = useState<Candle[]>([]);
  const [serverDecision, setServerDecision] = useState<BackendDecision | null>(null);
  const [serverDecisionError, setServerDecisionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [ml, setMl] = useState<MLPrediction | null>(null);
  const [mlLoading, setMlLoading] = useState(false);
  const [mlStatus, setMlStatus] = useState<'idle' | 'loading' | 'ready' | 'cached' | 'unavailable'>('idle');
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

  const availableMarkets = useMemo(() => {
    void availabilityRevision;
    return getMarketsByType(marketType);
  }, [marketType, availabilityRevision]);
  const dataProvider = useMemo(() => getDataProvider(symbol), [symbol]);

  useEffect(() => { candlesRef.current = candles; }, [candles]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void fetchMarketAvailability().then((records) => {
      if (!active) return;
      setMarketAvailability(records);
      setAvailabilityRevision((revision) => revision + 1);
      setSymbol((current) => records.find((record) => record.symbol === current)?.status === 'unavailable'
        ? getMarketsByType(marketType)[0]?.symbol ?? current
        : current);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [user, marketType]);

  // Load historical candles + subscribe to live kline stream
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    candlesRef.current = [];
    setCandles([]);
    setDecisionCandles([]);
    setLivePrice(null);
    setDataError(null);
    setWsStatus('connecting');
    setMl(null);
    setMlStatus('idle');

    (async () => {
      try {
        const data = await dataProvider.fetchKlines(symbol, timeframe, 1000);
        if (disposed) return;
        const merged = [...new Map([...data, ...candlesRef.current].map((candle) => [candle.time, candle])).values()].sort((a, b) => a.time - b.time);
        candlesRef.current = merged;
        setCandles(merged);
        setDecisionCandles(merged.slice(0, -1));
        setLivePrice(merged.length ? merged[merged.length - 1].close : null);
      } catch (error) {
        if (!disposed) {
          if (!candlesRef.current.length) setCandles([]);
          setDataError(error instanceof Error ? error.message : 'Market data could not be loaded.');
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    })();

    const unsub = dataProvider.subscribeKlines(symbol, timeframe, (candle, closed) => {
      const arr = [...candlesRef.current];
      const last = arr[arr.length - 1];
      if (last && last.time === candle.time) arr[arr.length - 1] = candle;
      else if (!last || candle.time > last.time) arr.push(candle);
      if (arr.length > 1500) arr.shift();
      candlesRef.current = arr;
      setCandles(arr);
      if (closed) {
        setDecisionCandles((previous) => {
          if (previous.at(-1) && previous[previous.length - 1].time > candle.time) return previous;
          return arr.filter((item) => item.time <= candle.time);
        });
      }
      setLivePrice(candle.close);
    }, (status) => setWsStatus(status));

    return () => { disposed = true; unsub(); };
  }, [dataProvider, symbol, timeframe, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    setServerDecision(null);
    setServerDecisionError(null);
    if (decisionCandles.length < 60) return () => { cancelled = true; };
    requestBackendDecision(symbol, timeframe, decisionCandles)
      .then((decision) => { if (!cancelled) { setServerDecision(decision); setServerDecisionError(decision ? null : 'Decision service returned no result.'); } })
      .catch((error) => { if (!cancelled) { setServerDecision(null); setServerDecisionError(error instanceof Error ? error.message : 'Decision analysis failed.'); } });
    return () => { cancelled = true; };
  }, [decisionCandles, symbol, timeframe]);

  // Fetch cached ML prediction instantly
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await fetchCachedMLPrediction(symbol, timeframe);
      if (!cancelled && cached) {
        setMl(cached);
        setMlStatus('cached');
      }
      if (decisionCandles.length >= 60) {
        if (!cancelled) setMlStatus('loading');
        const fresh = await fetchMLPrediction(symbol, timeframe);
        if (!cancelled) {
          if (fresh) {
            setMl(fresh);
            setMlStatus('ready');
          } else {
            setMlStatus(cached ? 'cached' : 'unavailable');
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [symbol, timeframe, decisionCandles.length]);

  const refreshML = async () => {
    setMlLoading(true);
    const pred = await fetchMLPrediction(symbol, timeframe);
    if (pred) {
      setMl(pred);
      setMlStatus('ready');
    } else {
      setMlStatus(ml ? 'cached' : 'unavailable');
    }
    setMlLoading(false);
  };

  const { signals, recommendation, risk } = useMemo(() => {
    if (decisionCandles.length < 60) return { signals: [] as Signal[], recommendation: null as Recommendation | null, risk: null };
    const sigs = runAllStrategies(decisionCandles, timeframe);
    const rec = combineSignals(sigs, ml, decisionCandles, symbol, timeframe);
    const r = riskLevels(decisionCandles);
    return { signals: sigs, recommendation: rec, risk: r };
  }, [decisionCandles, ml, symbol, timeframe]);

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

  const renderContent = () => {
    if (sidebarTab === 'admin' && isAdmin) {
      return <div className="p-4 lg:p-6"><AdminPanel /></div>;
    }

    if (sidebarTab === 'cms') {
      return (
        <div className="p-4 lg:p-6">
          {isAdmin ? <CMSManager /> : <PublishedArticles />}
        </div>
      );
    }

    if (sidebarTab === 'settings') return <SettingsPage />;
    if (sidebarTab === 'trader-desk') return <TraderDesk />;

    if (sidebarTab === 'markets') return <MarketsPage />;
    if (sidebarTab === 'ai-analysis') return <AIAnalysis signals={signals} ml={ml} mlStatus={mlStatus} recommendation={recommendation} onRefreshML={refreshML} mlLoading={mlLoading} candleCount={candles.length} marketLoading={loading} marketError={dataError} />;
    if (sidebarTab === 'strategies') return <StrategyLab signals={signals} candles={candles} timeframe={timeframe} />;
    if (sidebarTab === 'portfolio') return <PortfolioPage />;
    if (sidebarTab === 'backtesting') return <BacktestingCenter candles={candles} timeframe={timeframe} symbol={symbol} theme={theme} marketLoading={loading} marketError={dataError} onRetryMarketData={() => setReloadKey((key) => key + 1)} />;
    if (sidebarTab === 'watchlists') return <WatchlistsPage key={user?.id ?? 'local'} userId={user?.id} />;
    if (sidebarTab === 'alerts') return <AlertsPage key={user?.id ?? 'local'} />;
    if (sidebarTab === 'news') return <NewsPage />;
    if (sidebarTab === 'risk') return <RiskManagement />;
    if (sidebarTab === 'ai-learning') return <AILearning />;

    if (sidebarTab === 'terminal') {
      return (
        <div className="p-4 lg:p-6">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select aria-label="Trading terminal symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)}
              className="px-3.5 py-2 rounded-lg bg-surface border border-border text-text focus:outline-none focus:border-primary/40 text-sm font-medium">
              {availableMarkets.map((p) => <option key={p.symbol} value={p.symbol}>{p.label}</option>)}
            </select>
            <div className="flex items-center gap-1 px-3 py-2 rounded-lg bg-surface border border-border text-xs text-muted">
              <span className="text-text font-medium">1D</span><span>·</span><span>4H</span><span>·</span><span>15M</span><span>·</span><span>5M</span>
            </div>
            <span className="text-lg font-semibold tabular-nums ml-auto text-text">{formatMarketPrice(symbol, livePrice)}</span>
          </div>
          <div className="bg-surface border border-border rounded-xl overflow-hidden h-[600px] relative">
            <MultiTimeframeTerminal symbol={symbol} marketType={marketType} theme={theme} wsStatus={wsStatus} />
          </div>
        </div>
      );
    }

    return (
      <div className="dashboard-page px-4 lg:px-6 py-4 lg:py-5">
        <div className="dashboard-heading">
          <div className="dashboard-title">
            <span className="dashboard-eyebrow"><Activity className="w-3.5 h-3.5" /> Market overview</span>
            <h1>Dashboard</h1>
            <p>Real-time market context, autonomous decisions, and signal confidence.</p>
          </div>
          <div className="dashboard-market-price">
            <span className="dashboard-price-label">{symbol} <span>·</span> {timeframe}</span>
            <strong>{formatMarketPrice(symbol, livePrice)}</strong>
            <div className="dashboard-price-change">
              {priceChange !== null && <span className={priceChange >= 0 ? 'is-positive' : 'is-negative'}>
                {priceChange >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {Math.abs(priceChange).toFixed(2)}%
              </span>}
              <small>24-bar change</small>
            </div>
          </div>
        </div>

        <div className="dashboard-controls">
          <div className="dashboard-market-filters">
            <select
              aria-label="Market type"
              value={marketType}
              onChange={(e) => {
                const newType = e.target.value as MarketType;
                setMarketType(newType);
                const markets = getMarketsByType(newType);
                if (markets.length > 0 && !markets.find((m) => m.symbol === symbol)) {
                  setSymbol(markets[0].symbol);
                }
              }}
              className="dashboard-select"
            >
              {MARKET_TYPES.map((mt) => (
                <option key={mt.value} value={mt.value}>{mt.icon} {mt.label}</option>
              ))}
            </select>

            <select
              aria-label="Market symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="dashboard-select"
            >
              {availableMarkets.map((p) => <option key={p.symbol} value={p.symbol}>{p.label}</option>)}
            </select>
          </div>

          <div className="dashboard-timeframes" aria-label="Chart timeframe">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setTimeframe(tf.value)}
                aria-pressed={timeframe === tf.value}
                className={timeframe === tf.value ? 'is-active' : ''}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {dataError && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning" role="alert">
            <span>Market data unavailable: {dataError}</span>
            <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="rounded border border-warning/40 px-2 py-1 font-medium hover:bg-warning/10">Retry</button>
          </div>
        )}
        <AutonomousCommandCenter symbol={symbol} timeframe={timeframe} marketType={marketType} wsStatus={wsStatus} candles={candles} overlays={overlays} recommendation={recommendation} serverDecision={serverDecision} serverDecisionError={serverDecisionError} signals={signals} markets={availableMarkets} onSymbolChange={setSymbol} theme={theme} risk={risk} livePrice={livePrice} loading={loading} />
      </div>
    );
  };

  return (
    <div className="h-full flex bg-bg text-text">
      <Sidebar
        activeTab={sidebarTab}
        onTabChange={navigateToTab}
        isAdmin={isAdmin}
        collapsed={sidebarCollapsed && !mobileSidebarOpen}
        mobileOpen={mobileSidebarOpen}
        onToggle={() => {
          if (window.matchMedia('(max-width: 1024px)').matches) setMobileSidebarOpen((open) => !open);
          else setSidebarCollapsed((collapsed) => !collapsed);
        }}
      />
      {mobileSidebarOpen && <button className="sidebar-backdrop" type="button" aria-label="Close navigation" onClick={() => setMobileSidebarOpen(false)} />}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-border bg-surface/80 backdrop-blur-md flex items-center justify-between px-4 lg:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen((open) => !open)}
              className="dashboard-mobile-menu p-1.5 rounded-lg hover:bg-surface transition-colors text-muted hover:text-text"
              aria-label={mobileSidebarOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={mobileSidebarOpen}
              aria-controls="app-navigation"
            >
              {mobileSidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Activity className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="font-semibold tracking-tight text-sm hidden sm:inline">Quantum Intelligence</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <WsIndicator status={wsStatus} />
            <button onClick={toggle} aria-label="Toggle theme" className="p-2 rounded-lg hover:bg-bg transition-colors text-muted hover:text-text" title="Toggle theme">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <AvatarMenu email={user?.email ?? ''} displayName={profile?.displayName} avatarPath={profile?.avatarUrl} role={profile?.role ?? 'user'} onSettings={() => navigateToTab('settings')} onSignOut={signOut} />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

// ---- Sub-components ----

function WsIndicator({ status }: { status: WsStatus }) {
  const map: Record<WsStatus, { color: string; dot: string; icon: typeof Wifi; label: string }> = {
    open: { color: 'text-success', dot: 'bg-success', icon: Wifi, label: 'Live' },
    connecting: { color: 'text-warning', dot: 'bg-warning', icon: Wifi, label: 'Connecting' },
    reconnecting: { color: 'text-warning', dot: 'bg-warning', icon: WifiOff, label: 'Reconnecting' },
    closed: { color: 'text-danger', dot: 'bg-danger', icon: WifiOff, label: 'Disconnected' },
  };
  const { color, dot, icon: Icon, label } = map[status];
  return (
    <div className={`flex items-center gap-1.5 text-xs font-medium ${color}`} title={label} role="status" aria-label={`Market data ${label.toLowerCase()}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot} ${status === 'open' ? 'pulse-dot' : ''}`} />
      <Icon className="w-3.5 h-3.5 hidden sm:block" />
      <span className="hidden md:inline">{label}</span>
    </div>
  );
}

function AvatarMenu({ email, displayName, avatarPath, role, onSettings, onSignOut }: { email: string; displayName?: string; avatarPath?: string; role: string; onSettings: () => void; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  useEffect(() => { let active = true; void resolveAvatarUrl(avatarPath).then((url) => { if (active) setAvatar(url); }); return () => { active = false; }; }, [avatarPath]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  const initials = (displayName || email).split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U';
  return <div className="relative">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open} aria-label="Open account menu" className="flex items-center gap-2 rounded-full p-1.5 text-muted hover:bg-bg hover:text-text">
      {avatar ? <img src={avatar} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{initials}</span>}
      <span className="hidden max-w-40 truncate text-xs font-medium sm:block">{displayName || email}</span>
    </button>
    {open && <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-border bg-surface p-2 shadow-xl">
      <div className="border-b border-border px-3 py-2"><div className="truncate text-sm font-medium text-text">{displayName || 'Account details'}</div><div className="truncate text-xs text-muted">{email}</div><div className="mt-1 text-[10px] uppercase tracking-wide text-muted">{role}</div></div>
      <button type="button" role="menuitem" onClick={() => { setOpen(false); onSettings(); }} className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-text hover:bg-bg">Profile & settings</button>
      <button type="button" role="menuitem" onClick={onSignOut} className="w-full rounded-lg px-3 py-2 text-left text-sm text-text hover:bg-bg">Sign out</button>
    </div>}
  </div>;
}

// Published articles list — shown to non-admin users under the CMS/knowledge-base tab.
// Fetches only published content via the read_published_cms RLS policy.
function PublishedArticles() {
  const [articles, setArticles] = useState<CMSContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchPublishedContent();
        if (!cancelled) setArticles(data);
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="text-sm text-muted text-center py-12">Loading articles…</div>;
  if (selectedSlug) return <CMSViewer slug={selectedSlug} onBack={() => setSelectedSlug(null)} />;
  if (loadError) return <div role="alert" className="text-sm text-danger text-center py-12">Could not load the knowledge base. Please try again.</div>;
  if (articles.length === 0) return <div className="text-sm text-muted text-center py-12">No published articles yet.</div>;

  return (
    <div className="animate-fade-in space-y-3">
      <h2 className="text-base font-semibold mb-4 text-text">Knowledge Base</h2>
      {articles.map((a) => (
        <button
          key={a.id}
          onClick={() => setSelectedSlug(a.slug)}
          className="w-full text-left bg-surface border border-border rounded-xl p-4 hover:border-primary/20 hover:shadow-card-hover transition-all duration-200"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/8 text-primary capitalize font-medium">{a.contentType}</span>
            {a.tags.map((t: string) => (
              <span key={t} className="text-[10px] text-muted">#{t}</span>
            ))}
          </div>
          <div className="text-sm font-medium text-text">{a.title}</div>
          {a.excerpt && <div className="text-xs text-muted mt-1 line-clamp-2">{a.excerpt}</div>}
          {a.publishedAt && (
            <div className="text-[10px] text-muted mt-2">{new Date(a.publishedAt).toLocaleDateString()}</div>
          )}
        </button>
      ))}
    </div>
  );
}
