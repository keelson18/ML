import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ShieldCheck, Target, TrendingDown, TrendingUp } from 'lucide-react';
import TradingTerminal from './TradingTerminal';
import type { AutonomyStatus, BackendDecision } from '../lib/backend-api';
import { fetchAutonomyStatus } from '../lib/backend-api';
import type { Candle, Market, Recommendation, Signal, Timeframe } from '../lib/types';
import { formatMarketPrice } from '../lib/markets';

interface Props {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  candlesStale: boolean;
  recommendation: Recommendation | null;
  serverDecision: BackendDecision | null;
  serverDecisionError: string | null;
  signals: Signal[];
  markets: Pick<Market, 'symbol' | 'label' | 'baseAsset'>[];
  onSymbolChange: (symbol: string) => void;
  theme: 'light' | 'dark';
  livePrice: number | null;
  loading: boolean;
}

const initialStatus: AutonomyStatus = { state: 'OFFLINE', processedDecisions: 0, executedOrders: 0, skippedRuns: 0, consecutiveFailures: 0 };

export default function AutonomousCommandCenter({ symbol, timeframe, candles, candlesStale, recommendation, serverDecision, serverDecisionError, signals, markets, onSymbolChange, theme, livePrice, loading }: Props) {
  const [status, setStatus] = useState<AutonomyStatus>(initialStatus);
  const [statusError, setStatusError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => fetchAutonomyStatus().then((next) => { if (!cancelled) { setStatus(next); setStatusError(false); } }).catch(() => { if (!cancelled) setStatusError(true); });
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const serverDirection = serverDecision?.marketBias ?? (serverDecision?.decision === 'BUY' ? 'buy' : serverDecision?.decision === 'SELL' ? 'sell' : 'neutral');
  const direction = serverDecision ? serverDirection : recommendation?.side ?? 'neutral';
  const confidence = serverDecision ? Math.round(serverDecision.confidence * 100) : recommendation ? Math.round(Math.abs(recommendation.score) * 100) : 0;
  const evidence = useMemo(() => signals.slice(0, 6), [signals]);
  const automatic = status.state === 'MONITORING' || status.state === 'DECIDING';
  const actionable = serverDecision?.decision === 'BUY' || serverDecision?.decision === 'SELL';
  const actionLabel = serverDecision ? serverDecision.decision : serverDecisionError ? 'BLOCKED' : 'WAIT';
  const decisionMessage = serverDecisionError
    ? [
      `${serverDecisionError.replace(/[.!?]+$/, '')}.`,
      serverDecisionError.includes('Market is not verified') ? 'An admin can verify configured markets from Admin → Market Availability → Probe markets.' : null,
      'Local indicator output is bias context only.',
    ].filter(Boolean).join(' ')
    : 'Waiting for the server decision. Local indicator output is bias context only.';

  return (
    <section className="command-center" aria-label="Autonomous trading command center">
      <div className="command-center-header">
        <div><span className="command-kicker">AUTONOMOUS COMMAND CENTER</span><h2>{symbol} <span>{timeframe} execution</span></h2></div>
        <div className="command-health"><span className={`health-dot ${automatic ? 'is-live' : ''}`} />{statusError ? 'API OFFLINE' : automatic ? 'AUTOMATIC' : status.state}</div>
      </div>

      <div className="command-center-grid">
        <aside className="command-panel context-panel">
          <PanelTitle label="WATCHLIST / 4H BIAS" icon={<Activity className="w-3.5 h-3.5" />} />
          <div className="command-watchlist">{markets.slice(0, 6).map((market) => <button key={market.symbol} className={market.symbol === symbol ? 'is-active' : ''} onClick={() => onSymbolChange(market.symbol)}><span>{market.baseAsset}</span><small>{market.symbol === symbol ? 'ACTIVE' : market.label}</small></button>)}</div>

          <div className={`bias-badge ${direction === 'buy' ? 'bullish' : direction === 'sell' ? 'bearish' : 'neutral'}`}>{direction === 'buy' ? <TrendingUp className="w-4 h-4" /> : direction === 'sell' ? <TrendingDown className="w-4 h-4" /> : <Target className="w-4 h-4" />} {direction.toUpperCase()}</div>
          <ContextRow label="Market bias" value={direction === 'neutral' ? 'Unknown' : direction === 'buy' ? 'Bullish' : 'Bearish'} />
          <ContextRow label="Execution" value={`${timeframe} active`} />
          <ContextRow label="Data" value={loading ? 'Loading' : candles.length >= 60 ? 'Validated' : 'Collecting'} />
          <div className="context-note">The engine watches, decides, and manages paper positions automatically. This view is for oversight.</div>
        </aside>

        <div className="command-chart">
          <div className="chart-caption"><span>EXECUTION CHART</span><span className="flex items-center gap-2">{candlesStale && <span role="status" className="rounded border border-warning/30 px-1.5 py-0.5 text-warning">STALE</span>}{formatMarketPrice(symbol, livePrice)}</span></div>
          <div className="command-chart-canvas">{candles.length > 0 ? <TradingTerminal candles={candles} theme={theme} /> : <div className="command-empty">{loading ? 'Loading market data' : 'No market data available'}</div>}</div>
        </div>

        <aside className="command-panel evidence-panel">
          <PanelTitle label="EVIDENCE" icon={<ShieldCheck className="w-3.5 h-3.5" />} />
          <Meter
            label={serverDecision ? 'Heuristic confidence · not calibrated' : 'Local bias strength · not calibrated'}
            value={confidence}
            detail={serverDecision ? 'Diagnostic score from evidence, data quality, regime, and risk factors; not a probability of success.' : 'Local indicator strength is context only and is not a calibrated probability.'}
          />
          {serverDecision?.confidenceBreakdown && <details className="confidence-breakdown">
            <summary>How this score is calculated</summary>
            <div className="confidence-factor-list">
              {serverDecision.confidenceBreakdown.factors.map((factor) => (
                <div key={factor.factor} className="confidence-factor">
                  <div className="confidence-factor-heading">
                    <span>{factor.factor.replaceAll('-', ' ')}</span>
                    <strong>{Math.round(factor.score * 100)}% <small>· {Math.round(factor.weight * 100)}% weight</small></strong>
                  </div>
                  <div className="meter-track" role="meter" aria-label={`${factor.factor.replaceAll('-', ' ')} factor`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(factor.score * 100)}>
                    <i style={{ width: `${Math.min(100, Math.max(0, factor.score * 100))}%` }} />
                  </div>
                  <small>{factor.explanation}</small>
                </div>
              ))}
              {serverDecision.confidenceBreakdown.contradictionPenalty > 0 && <p className="confidence-penalty">
                Contradictions reduced the aggregate by {Math.round(serverDecision.confidenceBreakdown.contradictionPenalty * 100)}%.
              </p>}
              {(serverDecision.confidenceBreakdown.riskBlocked || serverDecision.confidenceBreakdown.dataQualityBlocked) && <p className="confidence-penalty">
                {serverDecision.confidenceBreakdown.riskBlocked ? 'A risk or portfolio gate is blocking confidence.' : 'Data quality is blocking confidence.'}
              </p>}
            </div>
          </details>}
          {(serverDecision?.supportingEvidence ?? evidence.map((signal) => ({ source: signal.strategy, score: signal.confidence, explanation: signal.reason }))).map((item) => <Meter key={item.source} label={item.source} value={Math.round((item.score ?? 0) * 100)} detail={item.explanation} />)}
          {!evidence.length && <div className="command-empty compact">Evidence will appear after analysis.</div>}
          {serverDecision?.researchContext && <div className="mt-3 border-t border-border/60 pt-3" aria-label="AI Learning research context">
            <p className="text-[11px] font-semibold text-primary">AI Learning · supplementary, non-authoritative</p>
            <p className="mt-1 text-[11px] text-muted">{serverDecision.researchContext.status.replaceAll('_', ' ')} · {serverDecision.researchContext.note}</p>
            {serverDecision.researchContext.items.map((item) => <article key={item.id} className="mt-2 rounded-lg border border-border/50 bg-bg/50 p-2">
              <p className="text-[11px] font-medium">{item.title} · v{item.version}</p>
              <p className="mt-1 text-[11px] text-muted">{item.content}</p>
            </article>)}
          </div>}
          {serverDecision?.journalStatus === 'failed' && <p role="status" className="mt-2 text-[11px] text-warning">Analysis completed, but its AI Learning journal event could not be saved.</p>}
        </aside>
      </div>

      <div className="command-decision-bar">
        <div className={`command-decision decision-${actionable ? serverDirection : 'neutral'}`}><span>ACTION</span><strong>{actionLabel}</strong></div>
        <div className="decision-explanation">{serverDecision?.explanation ?? decisionMessage}</div>
        <div className="decision-risk"><span><ShieldCheck className="w-3.5 h-3.5" /> Risk capacity</span><strong>{serverDecision?.stages?.riskApproval.status.toUpperCase() ?? (actionable ? 'APPROVED' : serverDecision ? 'NOT CLEARED' : 'WAITING')}</strong></div>
        <div className="decision-risk"><span>Orders</span><strong>{status.executedOrders}</strong></div>
        {status.state === 'PAUSED' && <span title="Automatic engine paused after a safety event"><AlertTriangle className="w-4 h-4 text-warning" /></span>}
      </div>
      {serverDecision?.stages && <div className="decision-explanation border-t border-border/50 px-3 py-2 text-xs text-muted" aria-label="Decision stages">
        Setup: {serverDecision.stages.setupDetection.status.replaceAll('_', ' ')} · Entry: {serverDecision.stages.entryConfirmation.status.replaceAll('_', ' ')} · Final: {serverDecision.stages.finalDecision.action.replaceAll('_', ' ')}
      </div>}
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
