import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Sun, Moon, LogOut, Wifi, WifiOff, TrendingUp, TrendingDown, Minus,
  Target, Shield, Brain, Zap, RefreshCw, Menu, Info,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { TRACKED_PAIRS, TIMEFRAMES, MARKET_TYPES, type Candle, type Timeframe, type Signal, type Recommendation, type MLPrediction, type MarketType, type CMSContent } from '../lib/types';
import { fetchKlines, subscribeKlines } from '../lib/binance';
import { runStrategies, riskLevels } from '../lib/strategies';
import { combineSignals } from '../lib/backtest';
import { fetchMLPrediction, fetchCachedMLPrediction } from '../lib/mlClient';
import PriceChart from './PriceChart';
import KineticCoach from './KineticCoach';
import AdminPanel from './AdminPanel';
import ExplainableTrade from './ExplainableTrade';
import CMSManager from './CMS/CMSManager';
import CMSViewer from './CMS/CMSViewer';
import Sidebar, { type SidebarTab } from './Sidebar';
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
import TradingTerminal from './TradingTerminal';

type WsStatus = 'connecting' | 'open' | 'closed' | 'reconnecting';

export default function Dashboard() {
  const { user, profile, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [marketType, setMarketType] = useState<MarketType>('crypto');
  const [symbol, setSymbol] = useState<string>('BTCUSDT');
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [ml, setMl] = useState<MLPrediction | null>(null);
  const [mlLoading, setMlLoading] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const candlesRef = useRef<Candle[]>([]);

  const isAdmin = profile?.role === 'admin';
  const availableMarkets = useMemo(() => getMarketsByType(marketType), [marketType]);

  useEffect(() => { candlesRef.current = candles; }, [candles]);

  // Load historical candles + subscribe to live kline stream
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setCandles([]);
    setMl(null);

    (async () => {
      try {
        const data = await fetchKlines(symbol, timeframe, 1000);
        if (disposed) return;
        setCandles(data);
        setLivePrice(data.length ? data[data.length - 1].close : null);
      } catch {
        if (!disposed) setCandles([]);
      } finally {
        if (!disposed) setLoading(false);
      }
    })();

    const unsub = subscribeKlines(symbol, timeframe, (candle) => {
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
  }, [symbol, timeframe]);

  // Fetch cached ML prediction instantly
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await fetchCachedMLPrediction(symbol, timeframe);
      if (!cancelled && cached) setMl(cached);
    })();
    return () => { cancelled = true; };
  }, [symbol, timeframe]);

  const refreshML = async () => {
    setMlLoading(true);
    const pred = await fetchMLPrediction(symbol, timeframe);
    if (pred) setMl(pred);
    setMlLoading(false);
  };

  const { signals, recommendation, risk } = useMemo(() => {
    if (candles.length < 60) return { signals: [] as Signal[], recommendation: null as Recommendation | null, risk: null };
    const sigs = runStrategies(candles, timeframe);
    const rec = combineSignals(sigs, ml, candles, symbol, timeframe);
    const r = riskLevels(candles);
    return { signals: sigs, recommendation: rec, risk: r };
  }, [candles, ml, symbol, timeframe]);

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

    if (sidebarTab === 'settings') {
      return (
        <div className="p-4 lg:p-6 max-w-2xl">
          <h2 className="text-base font-semibold mb-4 text-text">Settings</h2>
          <div className="bg-surface border border-border rounded-xl p-5 space-y-5 shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-text">Theme</div>
                <div className="text-xs text-muted mt-0.5">Toggle between light and dark mode</div>
              </div>
              <button
                onClick={toggle}
                className="px-3.5 py-1.5 rounded-lg bg-bg border border-border text-xs font-medium hover:bg-surface hover:border-primary/30 transition-colors"
              >
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </button>
            </div>
            <div className="border-t border-border/60 pt-4">
              <div className="text-sm font-medium mb-1 text-text">Account</div>
              <div className="text-xs text-muted">{user?.email}</div>
              <div className="text-xs text-muted mt-1">Role: {profile?.role ?? 'user'}</div>
            </div>
            <div className="border-t border-border/60 pt-4">
              <div className="text-sm font-medium mb-1 text-text">Notifications</div>
              <div className="text-xs text-muted">Notification preferences coming soon.</div>
            </div>
          </div>
        </div>
      );
    }

    if (sidebarTab === 'markets') return <MarketsPage />;
    if (sidebarTab === 'ai-analysis') return <AIAnalysis signals={signals} ml={ml} recommendation={recommendation} onRefreshML={refreshML} mlLoading={mlLoading} />;
    if (sidebarTab === 'strategies') return <StrategyLab signals={signals} candles={candles} timeframe={timeframe} />;
    if (sidebarTab === 'portfolio') return <PortfolioPage />;
    if (sidebarTab === 'backtesting') return <BacktestingCenter candles={candles} timeframe={timeframe} />;
    if (sidebarTab === 'watchlists') return <WatchlistsPage />;
    if (sidebarTab === 'alerts') return <AlertsPage />;
    if (sidebarTab === 'news') return <NewsPage />;
    if (sidebarTab === 'risk') return <RiskManagement />;
    if (sidebarTab === 'ai-learning') return <AILearning />;

    if (sidebarTab === 'terminal') {
      return (
        <div className="p-4 lg:p-6">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select value={symbol} onChange={(e) => setSymbol(e.target.value)}
              className="px-3.5 py-2 rounded-lg bg-surface border border-border text-text focus:outline-none focus:border-primary/40 text-sm font-medium">
              {availableMarkets.map((p) => <option key={p.symbol} value={p.symbol}>{p.label}</option>)}
            </select>
            <div className="flex gap-0.5 p-1 rounded-lg bg-surface border border-border">
              {TIMEFRAMES.map((tf) => (
                <button key={tf.value} onClick={() => setTimeframe(tf.value)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${timeframe === tf.value ? 'bg-primary text-white' : 'text-muted hover:text-text'}`}>{tf.label}</button>
              ))}
            </div>
            <span className="text-lg font-semibold tabular-nums ml-auto text-text">${livePrice?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '--'}</span>
          </div>
          <div className="bg-surface border border-border rounded-xl overflow-hidden h-[600px] relative shadow-card">
            {loading && <div className="absolute inset-0 flex items-center justify-center text-muted text-sm"><RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading…</div>}
            {!loading && candles.length > 0 && <TradingTerminal symbol={symbol} marketType={marketType} candles={candles} overlays={overlays} timeframe={timeframe} theme={theme} wsStatus={wsStatus} />}
            {!loading && candles.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">No data</div>}
          </div>
        </div>
      );
    }

    // Default: Dashboard
    return (
      <div className="px-4 lg:px-6 py-4 lg:py-5">
        {/* Controls bar */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
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
            className="px-3.5 py-2 rounded-lg bg-surface border border-border text-text focus:outline-none focus:border-primary/40 text-sm font-medium"
          >
            {MARKET_TYPES.map((mt) => (
              <option key={mt.value} value={mt.value}>{mt.icon} {mt.label}</option>
            ))}
          </select>

          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="px-3.5 py-2 rounded-lg bg-surface border border-border text-text focus:outline-none focus:border-primary/40 text-sm font-medium"
          >
            {availableMarkets.length > 0
              ? availableMarkets.map((p) => <option key={p.symbol} value={p.symbol}>{p.label}</option>)
              : TRACKED_PAIRS.map((p) => <option key={p.symbol} value={p.symbol}>{p.label}</option>)
            }
          </select>

          <div className="flex gap-0.5 p-1 rounded-lg bg-surface border border-border">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setTimeframe(tf.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  timeframe === tf.value ? 'bg-primary text-white' : 'text-muted hover:text-text'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {livePrice != null && (
            <div className="flex items-center gap-2.5 ml-auto">
              <span className="text-xl font-semibold tabular-nums text-text">
                ${livePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              {priceChange !== null && (
                <span className={`text-sm flex items-center gap-1 font-medium ${priceChange >= 0 ? 'text-success' : 'text-danger'}`}>
                  {priceChange >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {Math.abs(priceChange).toFixed(2)}%
                </span>
              )}
            </div>
          )}

          {recommendation && signals.length > 0 && (
            <button
              onClick={() => setShowExplanation(!showExplanation)}
              className={`p-2 rounded-lg transition-all ${showExplanation ? 'bg-primary/10 text-primary' : 'text-muted hover:text-text hover:bg-surface'}`}
              title="Explain this trade"
            >
              <Info className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Chart + recommendation */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-surface border border-border rounded-xl overflow-hidden h-[420px] relative shadow-card">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center text-muted text-sm z-10">
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading market data…
                </div>
              )}
              {!loading && candles.length > 0 && (
                <PriceChart candles={candles} overlays={overlays} theme={theme} />
              )}
              {!loading && candles.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">
                  No data available
                </div>
              )}
            </div>

            {showExplanation && recommendation && signals.length > 0 && (
              <ExplainableTrade
                recommendation={recommendation}
                signals={signals}
                onClose={() => setShowExplanation(false)}
              />
            )}

            {recommendation && <RecommendationCard rec={recommendation} risk={risk} />}
          </div>

          {/* Right column: signals + ML */}
          <div className="space-y-4">
            <MLCard ml={ml} loading={mlLoading} onRefresh={refreshML} />
            <SignalsCard signals={signals} />
          </div>
        </div>

        {/* Coach */}
        <div className="mt-4 bg-surface border border-border rounded-xl h-[400px] overflow-hidden shadow-card">
          <KineticCoach />
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex bg-bg text-text">
      <Sidebar
        activeTab={sidebarTab}
        onTabChange={setSidebarTab}
        isAdmin={isAdmin}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-border bg-surface/80 backdrop-blur-md flex items-center justify-between px-4 lg:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1.5 rounded-lg hover:bg-bg transition-colors text-muted hover:text-text lg:hidden"
            >
              <Menu className="w-4 h-4" />
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
            <button onClick={toggle} className="p-2 rounded-lg hover:bg-bg transition-colors text-muted hover:text-text" title="Toggle theme">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <div className="hidden sm:block text-xs text-muted font-medium">{user?.email}</div>
            <button onClick={signOut} className="p-2 rounded-lg hover:bg-bg transition-colors text-muted hover:text-text" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
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
    <div className={`flex items-center gap-1.5 text-xs font-medium ${color}`} title={label}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot} ${status === 'open' ? 'pulse-dot' : ''}`} />
      <Icon className="w-3.5 h-3.5 hidden sm:block" />
      <span className="hidden md:inline">{label}</span>
    </div>
  );
}

function SideBadge({ side }: { side: string }) {
  const cfg = side === 'buy'
    ? { color: 'bg-success/10 text-success', icon: TrendingUp, label: 'BUY' }
    : side === 'sell'
    ? { color: 'bg-danger/10 text-danger', icon: TrendingDown, label: 'SELL' }
    : { color: 'bg-muted/10 text-muted', icon: Minus, label: 'NEUTRAL' };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${cfg.color}`}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

function RecommendationCard({ rec, risk }: { rec: Recommendation; risk: { atr: number; stopLoss: number; takeProfit: number; entry: number } | null }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 shadow-card animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2 text-text">
          <Zap className="w-4 h-4 text-primary" /> Combined Recommendation
        </h3>
        <SideBadge side={rec.side} />
      </div>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1">
          <div className="text-xs text-muted mb-1.5">Signal Score</div>
          <div className="h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${rec.score >= 0 ? 'bg-success' : 'bg-danger'}`}
              style={{ width: `${Math.abs(rec.score) * 100}%`, marginLeft: rec.score < 0 ? 'auto' : 0 }}
            />
          </div>
          <div className="text-xs text-muted mt-1.5 tabular-nums">{rec.score.toFixed(3)}</div>
        </div>
      </div>

      {risk && (
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          <RiskBox label="Entry" value={risk.entry} icon={Target} color="text-text" />
          <RiskBox label="Stop Loss" value={risk.stopLoss} icon={Shield} color="text-danger" />
          <RiskBox label="Take Profit" value={risk.takeProfit} icon={Target} color="text-success" />
        </div>
      )}
      {risk && (
        <div className="text-xs text-muted mb-4">
          ATR: <span className="tabular-nums font-medium">{risk.atr.toFixed(2)}</span> · Risk:Reward 1:2 · SL = 1.5×ATR
        </div>
      )}

      <div className="space-y-1">
        {rec.contributors.map((c, i) => (
          <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-bg/40 hover:bg-bg/60 transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              <SideBadge side={c.side} />
              <span className="truncate text-muted">{c.source}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-muted tabular-nums">{(c.weight * 100).toFixed(0)}%</span>
              <span className="text-muted tabular-nums w-10 text-right">{(c.confidence * 100).toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RiskBox({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Target; color: string }) {
  return (
    <div className="bg-bg/40 rounded-lg p-2.5 border border-border/40">
      <div className={`flex items-center gap-1 text-xs ${color} mb-1`}>
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-sm font-medium tabular-nums text-text">{value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
    </div>
  );
}

function MLCard({ ml, loading, onRefresh }: { ml: MLPrediction | null; loading: boolean; onRefresh: () => void }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2 text-text">
          <Brain className="w-4 h-4 text-primary" /> ML Prediction
        </h3>
        <button onClick={onRefresh} disabled={loading} className="p-1.5 rounded-lg hover:bg-bg transition-colors disabled:opacity-40">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {!ml && !loading && <div className="text-xs text-muted py-2">No prediction yet — click refresh to run the model.</div>}
      {loading && <div className="text-xs text-muted flex items-center gap-2 py-2"><RefreshCw className="w-3 h-3 animate-spin" /> Running model…</div>}
      {ml && (
        <div className="space-y-2.5 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Direction</span>
            <SideBadge side={ml.prediction === 'up' ? 'buy' : ml.prediction === 'down' ? 'sell' : 'neutral'} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Probability</span>
            <span className="text-sm font-medium tabular-nums text-text">{(ml.probability * 100).toFixed(1)}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Expected Move</span>
            <span className="text-sm font-medium tabular-nums text-text">{ml.expected_move_pct >= 0 ? '+' : ''}{ml.expected_move_pct.toFixed(2)}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Confidence</span>
            <span className="text-sm font-medium capitalize text-text">{ml.confidence}</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border/40">
            <span className="text-xs text-muted">Model</span>
            <span className="text-xs text-muted tabular-nums">v{ml.model_version}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function SignalsCard({ signals }: { signals: Signal[] }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 shadow-card">
      <h3 className="text-sm font-semibold mb-3 text-text">Strategy Signals</h3>
      {signals.length === 0 && <div className="text-xs text-muted py-2">No active signals.</div>}
      <div className="space-y-1.5">
        {signals.map((s, i) => (
          <div key={i} className="flex items-start gap-2 py-1.5 px-2 rounded-lg hover:bg-bg/40 transition-colors">
            <SideBadge side={s.side} />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-text">{s.strategy}</div>
              <div className="text-xs text-muted truncate mt-0.5">{s.reason}</div>
            </div>
            <div className="text-xs text-muted tabular-nums shrink-0 font-medium">{(s.confidence * 100).toFixed(0)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

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

  if (loading) return <div className="text-sm text-muted text-center py-12">Loading articles…</div>;
  if (selectedSlug) return <CMSViewer slug={selectedSlug} onBack={() => setSelectedSlug(null)} />;
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
