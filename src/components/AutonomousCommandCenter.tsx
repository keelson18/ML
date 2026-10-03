import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ShieldCheck, Target, TrendingDown, TrendingUp } from 'lucide-react';
import PriceChart from './PriceChart';
import TradingTerminal from './TradingTerminal';
import type { AutonomyStatus, BackendDecision } from '../lib/backend-api';
import { executePaperDecision, fetchAutonomyStatus } from '../lib/backend-api';
import type { Candle, Recommendation, Signal, Timeframe } from '../lib/types';

interface Props {
  symbol: string;
  timeframe: Timeframe;
  marketType: string;
  wsStatus: string;
  candles: Candle[];
  overlays: Parameters<typeof PriceChart>[0]['overlays'];
  recommendation: Recommendation | null;
  serverDecision: BackendDecision | null;
  serverDecisionError: string | null;
  signals: Signal[];
  markets: { symbol: string; label: string }[];
  onSymbolChange: (symbol: string) => void;
  theme: 'light' | 'dark';
  risk: { entry: number; stopLoss: number; takeProfit: number; atr: number } | null;
  livePrice: number | null;
  loading: boolean;
}

const initialStatus: AutonomyStatus = { state: 'OFFLINE', processedDecisions: 0, executedOrders: 0, skippedRuns: 0, consecutiveFailures: 0 };

export default function AutonomousCommandCenter({ symbol, timeframe, marketType, wsStatus, candles, overlays, recommendation, serverDecision, serverDecisionError, signals, markets, onSymbolChange, theme, risk, livePrice, loading }: Props) {
  const [status, setStatus] = useState<AutonomyStatus>(initialStatus);
  const [statusError, setStatusError] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => fetchAutonomyStatus().then((next) => { if (!cancelled) { setStatus(next); setStatusError(false); } }).catch(() => { if (!cancelled) setStatusError(true); });
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const serverDirection = serverDecision?.decision === 'BUY' ? 'buy' : serverDecision?.decision === 'SELL' ? 'sell' : 'neutral';
  const direction = serverDecision ? serverDirection : recommendation?.side ?? 'neutral';
  const confidence = serverDecision ? Math.round(serverDecision.confidence * 100) : recommendation ? Math.round(Math.abs(recommendation.score) * 100) : 0;
  const evidence = useMemo(() => signals.slice(0, 6), [signals]);
  const automatic = status.state === 'MONITORING' || status.state === 'DECIDING';
  const canExecute = Boolean(serverDecision && (serverDecision.decision === 'BUY' || serverDecision.decision === 'SELL'));

  const execute = async () => {
    if (!serverDecision || !canExecute) return;
    setExecuting(true);
    setExecutionMessage(null);
    try {
      const result = await executePaperDecision(symbol, serverDecision);
      setExecutionMessage(result.accepted ? `Paper order filled at $${result.fillPrice?.toLocaleString(undefined, { maximumFractionDigits: 4 })}.` : result.reason ?? 'Paper order was rejected by risk checks.');
    } catch {
      setExecutionMessage('Paper order could not be submitted. Please try again.');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <section className="command-center" aria-label="Autonomous trading command center">
      <div className="command-center-header">
        <div><span className="command-kicker">AUTONOMOUS COMMAND CENTER</span><h2>{symbol} <span>{timeframe} execution</span></h2></div>
        <div className="command-health"><span className={`health-dot ${automatic ? 'is-live' : ''}`} />{statusError ? 'API OFFLINE' : automatic ? 'AUTOMATIC' : status.state}</div>
      </div>

      <div className="command-center-grid">
        <aside className="command-panel context-panel">
          <PanelTitle label="WATCHLIST / 4H BIAS" icon={<Activity className="w-3.5 h-3.5" />} />
          <div className="command-watchlist">{markets.slice(0, 6).map((market) => <button key={market.symbol} className={market.symbol === symbol ? 'is-active' : ''} onClick={() => onSymbolChange(market.symbol)}><span>{market.symbol.replace('USDT', '')}</span><small>{market.symbol === symbol ? 'ACTIVE' : market.label}</small></button>)}</div>

          <div className={`bias-badge ${direction === 'buy' ? 'bullish' : direction === 'sell' ? 'bearish' : 'neutral'}`}>{direction === 'buy' ? <TrendingUp className="w-4 h-4" /> : direction === 'sell' ? <TrendingDown className="w-4 h-4" /> : <Target className="w-4 h-4" />} {direction.toUpperCase()}</div>
          <ContextRow label="Structure" value={serverDecision?.strategy ?? (signals[0]?.side === 'buy' ? 'Higher highs' : signals[0]?.side === 'sell' ? 'Lower lows' : 'Awaiting')} />
          <ContextRow label="Execution" value={`${timeframe} active`} />
          <ContextRow label="Data" value={loading ? 'Loading' : candles.length >= 60 ? 'Validated' : 'Collecting'} />
          <div className="context-note">The engine watches, decides, and manages paper positions automatically. This view is for oversight.</div>
        </aside>

        <div className="command-chart">
          <div className="chart-caption"><span>EXECUTION CHART</span><span>{livePrice ? `$${livePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '--'}</span></div>
          <div className="command-chart-canvas">{candles.length > 0 ? <TradingTerminal symbol={symbol} marketType={marketType} candles={candles} overlays={overlays} timeframe={timeframe} theme={theme} wsStatus={wsStatus} /> : <div className="command-empty">{loading ? 'Loading market data' : 'No market data available'}</div>}</div>
        </div>

        <aside className="command-panel evidence-panel">
          <PanelTitle label="EVIDENCE" icon={<ShieldCheck className="w-3.5 h-3.5" />} />
          <Meter label="Overall confidence" value={confidence} />
          {(serverDecision?.supportingEvidence ?? evidence.map((signal) => ({ source: signal.strategy, score: signal.confidence, explanation: signal.reason }))).map((item) => <Meter key={item.source} label={item.source} value={Math.round((item.score ?? 0) * 100)} detail={item.explanation} />)}
          {!evidence.length && <div className="command-empty compact">Evidence will appear after analysis.</div>}
        </aside>
      </div>

      <div className="command-decision-bar">
        <div className={`command-decision decision-${direction}`}><span>DECISION</span><strong>{direction === 'neutral' ? 'NO_TRADE' : direction.toUpperCase()}</strong></div>
        <div className="decision-explanation">{serverDecision?.explanation ?? (serverDecisionError ? `Server decision analysis is unavailable: ${serverDecisionError}. Local evidence is shown where possible.` : recommendation ? `${recommendation.contributors.length} local engines contributing while the server decision loads.` : 'No executable setup. Capital remains protected while the system waits.')}</div>
        <div className="decision-risk"><span><ShieldCheck className="w-3.5 h-3.5" /> Risk gate</span><strong>{risk ? 'READY' : 'WAITING'}</strong></div>
        <div className="decision-risk"><span>Orders</span><strong>{status.executedOrders}</strong></div>
        {canExecute && <button type="button" onClick={() => void execute()} disabled={executing} className="px-3 py-2 rounded-lg bg-primary text-black text-xs font-semibold disabled:opacity-50">{executing ? 'Checking risk…' : 'Execute paper trade'}</button>}
        {status.state === 'PAUSED' && <span title="Automatic engine paused after a safety event"><AlertTriangle className="w-4 h-4 text-warning" /></span>}
      </div>
      {executionMessage && <div role="status" className="text-xs text-muted px-3 py-2 border-t border-border/50">{executionMessage}</div>}
    </section>
  );
}

function PanelTitle({ label, icon }: { label: string; icon: React.ReactNode }) {
  return <div className="command-panel-title"><span>{label}</span>{icon}</div>;
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return <div className="context-row"><span>{label}</span><strong>{value}</strong></div>;
}

function Meter({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return <div className="evidence-meter"><div><span>{label}</span><strong>{value}%</strong></div><div className="meter-track"><i style={{ width: `${value}%` }} /></div>{detail && <small>{detail}</small>}</div>;
}
