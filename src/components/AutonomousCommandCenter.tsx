import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, ShieldCheck, Target, TrendingDown, TrendingUp } from 'lucide-react';
import TradingTerminal from './TradingTerminal';
import type { BackendDecision, BotStatus } from '../lib/backend-api';
import { fetchBotStatus } from '../lib/backend-api';
import { botToneClass, describeBotBias, describeExecution, describePlan, describeRisk, describeTrigger, formatBotTimestamp, presentBotAction } from '../lib/bot-status';
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

export default function AutonomousCommandCenter({ symbol, timeframe, candles, candlesStale, recommendation, serverDecision, serverDecisionError, signals, markets, onSymbolChange, theme, livePrice, loading }: Props) {
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    let cancelled = false;
    // Polls the authenticated bot-status endpoint only; it never forces a provider fetch or a bot cycle.
    const refresh = () => {
      const sequence = ++requestSequence.current;
      fetchBotStatus(symbol, timeframe)
        .then((next) => {
          if (cancelled || sequence !== requestSequence.current) return;
          setBotStatus(next);
          setStatusError(null);
        })
        .catch((cause: unknown) => {
          if (cancelled || sequence !== requestSequence.current) return;
          // Never keep showing a previous successful status as if it were current.
          setBotStatus(null);
          setStatusError(cause instanceof Error ? cause.message : 'Bot status is unavailable.');
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [symbol, timeframe]);

  const serverDirection = serverDecision?.marketBias ?? (serverDecision?.decision === 'BUY' ? 'buy' : serverDecision?.decision === 'SELL' ? 'sell' : 'neutral');
  const botBias = botStatus?.analysis.marketBias;
  const direction = botBias === 'BUY' ? 'buy' : botBias === 'SELL' ? 'sell' : botBias === 'NEUTRAL' ? 'neutral' : serverDecision ? serverDirection : recommendation?.side ?? 'neutral';
  const confidenceScore = serverDecision?.confidence ?? (recommendation ? Math.abs(recommendation.score) : 0);
  const confidenceLabel = confidenceScore >= 0.7 ? 'HIGH' : confidenceScore >= 0.4 ? 'MODERATE' : 'LOW';
  const evidence = useMemo(() => signals.slice(0, 6), [signals]);
  const presentation = botStatus ? presentBotAction(botStatus.action) : null;
  const live = Boolean(botStatus && ['MONITORING', 'ANALYZING', 'PLAN_CREATED', 'WAITING_FOR_TRIGGER', 'TRIGGER_CONFIRMED', 'READY_FOR_PAPER_EXECUTION', 'PAPER_ORDER_PENDING', 'POSITION_OPEN', 'PAPER_BUY', 'PAPER_SELL'].includes(botStatus.action));
  const actionLabel = presentation ? presentation.label : statusError ? 'UNAVAILABLE' : 'LOADING';
  const decisionMessage = statusError
    ? `Bot status connection failed: ${statusError.replace(/[.!?]+$/, '')}. No previous state is shown because it may no longer be current.`
    : botStatus?.blockingReason ?? presentation?.description ?? 'Loading the authoritative bot lifecycle from the backend.';

  return (
    <section className="command-center" aria-label="Autonomous trading command center">
      <div className="command-center-header">
        <div><span className="command-kicker">AUTONOMOUS COMMAND CENTER</span><h2>{symbol} <span>{timeframe} execution</span></h2></div>
        <div className="command-health"><span className={`health-dot ${live ? 'is-live' : ''}`} />{statusError ? 'API OFFLINE' : presentation ? presentation.label : 'CONNECTING'}</div>
      </div>

      <div className="command-center-grid">
        <aside className="command-panel context-panel">
          <PanelTitle label="WATCHLIST / 4H BIAS" icon={<Activity className="w-3.5 h-3.5" />} />
          <div className="command-watchlist">{markets.slice(0, 6).map((market) => <button key={market.symbol} className={market.symbol === symbol ? 'is-active' : ''} onClick={() => onSymbolChange(market.symbol)}><span>{market.baseAsset}</span><small>{market.symbol === symbol ? 'ACTIVE' : market.label}</small></button>)}</div>

          <div className={`bias-badge ${direction === 'buy' ? 'bullish' : direction === 'sell' ? 'bearish' : 'neutral'}`}>{direction === 'buy' ? <TrendingUp className="w-4 h-4" /> : direction === 'sell' ? <TrendingDown className="w-4 h-4" /> : <Target className="w-4 h-4" />} {direction.toUpperCase()}</div>
          <ContextRow label="Market bias" value={botStatus ? describeBotBias(botStatus.analysis.marketBias) : direction === 'neutral' ? 'Unknown' : direction === 'buy' ? 'Bullish' : 'Bearish'} />
          <ContextRow label="Active plan" value={describePlan(botStatus?.plan ?? null)} />
          <ContextRow label="Data" value={statusError ? 'Unavailable' : botStatus ? `${botStatus.data.status}${botStatus.data.provider ? ` · ${botStatus.data.provider}` : ''}` : loading ? 'Loading' : 'Connecting'} />
          <ContextRow label="Shadow mode" value={botStatus ? (botStatus.shadowMode ? 'On · no paper fill' : 'Off') : 'Unknown'} />
          <div className="context-note">The engine watches, decides, and manages paper positions automatically. This view is for oversight.</div>
        </aside>

        <div className="command-chart">
          <div className="chart-caption"><span>EXECUTION CHART</span><span className="flex items-center gap-2">{candlesStale && <span role="status" className="rounded border border-warning/30 px-1.5 py-0.5 text-warning">STALE</span>}{formatMarketPrice(symbol, livePrice)}</span></div>
          <div className="command-chart-canvas">{candles.length > 0 ? <TradingTerminal candles={candles} theme={theme} /> : <div className="command-empty">{loading ? 'Loading market data' : 'No market data available'}</div>}</div>
        </div>

        <aside className="command-panel evidence-panel">
          <PanelTitle label="EVIDENCE" icon={<ShieldCheck className="w-3.5 h-3.5" />} />
          <div className="evidence-meter">
            <div><span>OVERALL CONFIDENCE</span><strong>{confidenceLabel}</strong></div>
            <small>{serverDecision ? 'Canonical decision-engine classification.' : 'Local bias context; awaiting canonical analysis.'}</small>
          </div>
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
        <div className={`command-decision decision-${botStatus?.execution.finalAction === 'SELL' ? 'sell' : botStatus?.execution.finalAction === 'BUY' ? 'buy' : 'neutral'}`}>
          <span>ACTION</span>
          <strong className={presentation ? botToneClass(presentation.tone) : undefined}>{actionLabel}</strong>
        </div>
        <div className="decision-explanation">{decisionMessage}</div>
        <div className="decision-risk"><span>Trigger</span><strong>{botStatus ? describeTrigger(botStatus) : '—'}</strong></div>
        <div className="decision-risk"><span><ShieldCheck className="w-3.5 h-3.5" /> Risk</span><strong>{botStatus ? describeRisk(botStatus) : '—'}</strong></div>
        <div className="decision-risk"><span>Execution</span><strong>{botStatus ? describeExecution(botStatus) : '—'}</strong></div>
        <div className="decision-risk"><span>Closed trades</span><strong>{botStatus?.closedTradeCount ?? 0}</strong></div>
        {botStatus?.action === 'PAUSED' && <span title="Automatic engine paused after a safety event"><AlertTriangle className="w-4 h-4 text-warning" /></span>}
      </div>
      <div className="decision-explanation border-t border-border/60 pt-2 text-[11px] text-muted">
        Market bias {botStatus ? describeBotBias(botStatus.analysis.marketBias) : 'unknown'} · Last bot cycle {formatBotTimestamp(botStatus?.scheduler.lastCycleAt ?? null)} · Last processed candle {formatBotTimestamp(botStatus?.lastProcessedCandleAt ?? null)} · Bias is context only and never an approved paper trade.
      </div>
      {serverDecisionError && <p role="status" className="decision-explanation text-[11px] text-warning">Decision analysis is unavailable: {serverDecisionError.replace(/[.!?]+$/, '')}. This does not change the bot lifecycle state above.</p>}
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
