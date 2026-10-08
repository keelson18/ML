import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, ClipboardList, Clock3, RefreshCw, ShieldCheck } from 'lucide-react';
import PageFrame from '../PageFrame';
import { advanceTraderPlans, fetchAutonomyStatus, fetchTraderHistory, fetchTraderOverview, fetchTraderPlans, refreshTraderPlans, type AutonomyStatus, type TraderAdvanceResult, type TraderOverview, type TraderPlan } from '../../lib/backend-api';

type Review = { review_date?: string; reviewDate?: string; metrics?: { sampleSize?: number; sampleWarning?: string; expectancyR?: number | null } };
type Journal = { id?: string; symbol?: string; setup_type?: string; outcome_r?: number; r_multiple?: number; created_at?: string; status?: string; metrics?: { rMultiple?: number; pnl?: number; exitReason?: string } };
type BiasRow = { bias: string; regime: string; keyLevels: number[]; qualityScore: number; reason: string };

function money(value: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value); }
function sign(value: number) { return value >= 0 ? '+' : ''; }

export default function TraderDesk() {
  const [plans, setPlans] = useState<TraderPlan[]>([]);
  const [overview, setOverview] = useState<TraderOverview | null>(null);
  const [autonomy, setAutonomy] = useState<AutonomyStatus | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [journal, setJournal] = useState<Journal[]>([]);
  const [bias, setBias] = useState<BiasRow[]>([]);
  const [advanceResult, setAdvanceResult] = useState<TraderAdvanceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState(false);

  const load = useCallback(async (advance = true) => {
    setLoading(true);
    setError(null);
    if (advance) {
      try { setAdvanceResult(await advanceTraderPlans()); }
      catch { /* existing saved plans and account data remain readable when the executor is offline */ }
    }
    const [planResult, overviewResult, autonomyResult, reviewResult, journalResult] = await Promise.allSettled([
      fetchTraderPlans(), fetchTraderOverview(), fetchAutonomyStatus(), fetchTraderHistory<Review>('reviews'), fetchTraderHistory<Journal>('journal'),
    ]);
    if (planResult.status === 'fulfilled') setPlans(planResult.value);
    if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value);
    if (autonomyResult.status === 'fulfilled') setAutonomy(autonomyResult.value);
    if (reviewResult.status === 'fulfilled') setReviews(reviewResult.value);
    if (journalResult.status === 'fulfilled') setJournal(journalResult.value);
    setHistoryError(reviewResult.status === 'rejected' || journalResult.status === 'rejected');
    if (planResult.status === 'rejected' && overviewResult.status === 'rejected') setError('Trader Desk data is unavailable. Check backend health and whether the latest Trader Desk migration has been applied.');
    setLoading(false);
  }, []);

  useEffect(() => { void load(); const timer = window.setInterval(() => { void (async () => { try { setAdvanceResult(await advanceTraderPlans()); await load(false); } catch { /* the next tick retries */ } })(); }, 60_000); return () => window.clearInterval(timer); }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const result = await refreshTraderPlans();
      setPlans(result.plans);
      setBias(result.watchlist);
      setAdvanceResult(await advanceTraderPlans());
      const fresh = await fetchTraderOverview();
      setOverview(fresh);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not refresh the plan board.');
    } finally { setRefreshing(false); }
  };

  const waitingPlans = useMemo(() => plans.filter((plan) => ['WATCHING', 'ARMED', 'PENDING_ORDER'].includes(plan.status)), [plans]);
  const dailyLossUsed = overview && overview.equity > 0 ? Math.max(0, -overview.dailyPnl) / (overview.equity * overview.dailyLossLimitPct / 100) * 100 : 0;
  const weeklyLossUsed = overview && overview.equity > 0 ? Math.max(0, -overview.weeklyPnl) / (overview.equity * overview.weeklyLossLimitPct / 100) * 100 : 0;

  return <div className="dashboard-page px-4 py-5 lg:px-6">
    <PageFrame title="Trader Desk" eyebrow="Plan · Execute · Review" description="A paper trading workspace built around written plans, confirmed triggers, and risk limits." icon={ClipboardList}
      actions={<button type="button" onClick={() => void refresh()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text hover:border-primary/40 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />{refreshing ? 'Scanning markets' : 'Refresh plans'}</button>}>
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-text">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <div><strong>Paper trading only — not financial advice.</strong> Results are simulated and do not predict real performance.</div>
      </div>
      {error && <div role="alert" className="mb-5 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
      {loading && <div className="mb-5 rounded-xl border border-border bg-surface p-4 text-sm text-muted">Loading paper account and plan history…</div>}

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Paper account and risk">
        <Metric label="Paper equity" value={overview ? money(overview.equity) : '—'} detail={overview ? `${money(overview.cash)} cash · ${money(overview.unrealizedPnl)} unrealized` : 'Account snapshot unavailable'} />
        <Metric label="Open risk / heat" value={overview ? `${money(overview.openRiskCash)} · ${overview.heatPct.toFixed(2)}%` : '—'} detail="Risk to current stops across open positions" />
        <Metric label="Daily loss limit" value={overview ? `${money(Math.max(0, -overview.dailyPnl))} / ${money(overview.equity * overview.dailyLossLimitPct / 100)}` : '—'} detail={`${Math.min(100, dailyLossUsed).toFixed(0)}% of configured limit used`} warning={dailyLossUsed >= 75} />
        <Metric label="Weekly loss limit" value={overview ? `${money(Math.max(0, -overview.weeklyPnl))} / ${money(overview.equity * overview.weeklyLossLimitPct / 100)}` : '—'} detail={`${Math.min(100, weeklyLossUsed).toFixed(0)}% of configured limit used`} warning={weeklyLossUsed >= 75} />
      </section>

      {!!overview?.staleSymbols.length && <div role="status" className="mb-5 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">Stale price data: {overview.staleSymbols.join(', ')}. Open position marks use the last stored entry price until fresh data is available.</div>}
      {advanceResult?.shadowMode && <div role="status" className="mb-5 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm text-text">Shadow mode is enabled. Confirmed triggers are recorded for research, but they do not open paper positions.</div>}
      {!!advanceResult?.staleSymbols.length && <div role="status" className="mb-5 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">Execution and management skipped stale candles for: {advanceResult.staleSymbols.join(', ')}.</div>}
      {!!advanceResult?.shadowSignals.length && <div className="mb-5 rounded-xl border border-border bg-surface p-4"><h2 className="text-sm font-semibold text-text">Would-have-traded signals</h2><div className="mt-2 space-y-2">{advanceResult.shadowSignals.slice(-4).map((signal) => <p key={`${signal.planId}:${signal.candleTime}`} className="text-xs text-muted">{signal.reason} · {new Date(signal.candleTime * 1000).toLocaleString()}</p>)}</div></div>}

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="plans-title">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h2 id="plans-title" className="font-semibold text-text">Plans</h2><p className="mt-1 text-xs text-muted">Wait for the written trigger; candle closes alone do not place orders.</p></div><span className="rounded-full bg-bg px-2.5 py-1 text-xs text-muted">{waitingPlans.length} active</span></div>
          {waitingPlans.length === 0 ? <Empty>No active plan. Most scans should end with no trade.</Empty> : <div className="space-y-3">{waitingPlans.map((plan) => <article key={plan.id} className="rounded-lg border border-border bg-bg/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><strong className="text-sm text-text">{plan.symbol}</strong><Pill>{plan.status.replaceAll('_', ' ')}</Pill><Pill>{plan.grade} grade</Pill></div><span className="text-xs text-muted">{plan.setupType}</span></div>
            <p className="mt-2 text-sm text-text">{plan.thesis}</p>{plan.lastReason && <p className="mt-1 text-xs text-muted">Latest check: {plan.lastReason}</p>}
            <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-3"><span>Zone: <b className="text-text">{plan.zone.low.toPrecision(6)}–{plan.zone.high.toPrecision(6)}</b></span><span>Trigger: <b className="text-text">{plan.trigger.kind.replaceAll('_', ' ')}{plan.trigger.level ? ` ${plan.trigger.level}` : ''}</b></span><span>Invalidation: <b className="text-text">{plan.invalidation}</b></span></div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"><span>HTF: {plan.htfBias}</span><span>R:R minimum: {plan.minRR}:1</span><span>Expires at bar {plan.expiresAtBar}</span><span>Target: {plan.targets.map((target) => target.price).join(', ') || '—'}</span></div>
          </article>)}</div>}
        </section>

        <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="bias-title">
          <div className="mb-4 flex items-center justify-between"><div><h2 id="bias-title" className="font-semibold text-text">Market bias board</h2><p className="mt-1 text-xs text-muted">Latest planner scan across the configured watchlist.</p></div><Activity className="h-4 w-4 text-primary" /></div>
          {bias.length ? <div className="space-y-2">{bias.map((item, index) => <div key={`${item.bias}-${index}`} className="flex items-start justify-between gap-3 rounded-lg bg-bg/60 p-3"><div><div className="flex gap-2 text-sm font-medium text-text"><span>{item.bias}</span><span className="text-muted">·</span><span>{item.regime}</span></div><p className="mt-1 text-xs text-muted">{item.reason}</p>{item.keyLevels.length > 0 && <p className="mt-1 text-xs text-muted">Levels: {item.keyLevels.map((level) => level.toPrecision(5)).join(' · ')}</p>}</div><span className="text-xs tabular-nums text-muted">{Math.round(item.qualityScore * 100)}%</span></div>)}</div> : <Empty>Refresh plans to get a current bias scan. No scan is shown as a live market view until refreshed.</Empty>}
        </section>

        <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="positions-title">
          <div className="mb-4 flex items-center justify-between"><div><h2 id="positions-title" className="font-semibold text-text">Open positions</h2><p className="mt-1 text-xs text-muted">Mark to market · stop and management state</p></div></div>
          {!overview?.positions.length ? <Empty>No open paper positions.</Empty> : <div className="space-y-2">{overview.positions.map((position) => <div key={position.id} className="rounded-lg bg-bg/60 p-3"><div className="flex justify-between gap-3"><strong className="text-sm text-text">{position.symbol}</strong><span className={`flex items-center gap-1 text-sm ${position.unrealizedPnl >= 0 ? 'text-success' : 'text-danger'}`}>{position.unrealizedPnl >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}{sign(position.unrealizedPnl)}{money(position.unrealizedPnl)} · {sign(position.rMultiple)}{position.rMultiple.toFixed(2)}R</span></div><div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted"><span>Mark {position.currentPrice}</span><span>Entry {position.entryPrice}</span><span>Stop {position.stopLoss ?? '—'}</span><span>Next target {position.takeProfit ?? 'plan targets'}</span></div></div>)}</div>}
        </section>

        <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="why-title">
          <div className="mb-4 flex items-center justify-between"><div><h2 id="why-title" className="font-semibold text-text">Why no trade</h2><p className="mt-1 text-xs text-muted">Current reasons to wait or stand aside.</p></div><Clock3 className="h-4 w-4 text-muted" /></div>
          {waitingPlans.length ? <div className="space-y-2">{waitingPlans.slice(0, 5).map((plan) => <div key={plan.id} className="rounded-lg bg-bg/60 p-3 text-sm text-text"><b>{plan.symbol}</b>: {plan.lastReason ?? `waiting for ${plan.trigger.kind.replaceAll('_', ' ')} inside the planned zone.`}</div>)}</div> : <Empty>{bias.length ? bias.slice(0, 5).map((row) => row.reason).join(' ') : 'No active setup is currently confirmed. Refresh plans for a new closed-candle scan.'}</Empty>}
          <div className="mt-3 border-t border-border pt-3 text-xs text-muted">Autonomy: <b className="text-text">{autonomy?.state ?? 'status unavailable'}</b>{autonomy?.lastRunAt ? ` · last run ${new Date(autonomy.lastRunAt).toLocaleString()}` : ''}</div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="journal-title">
          <div className="mb-4 flex items-center justify-between"><div><h2 id="journal-title" className="font-semibold text-text">Journal & daily review</h2><p className="mt-1 text-xs text-muted">Sample size and expectancy are shown only when stored evidence is available.</p></div></div>
          {historyError && <p className="mb-3 text-xs text-warning">Journal/review history is unavailable. Apply the Trader Desk journal migration if it is pending.</p>}
          {reviews.length > 0 && <div className="mb-3 rounded-lg bg-bg/60 p-3 text-sm text-text">Latest review: {reviews[0]?.review_date ?? reviews[0]?.reviewDate ?? 'date unavailable'} · n={reviews[0]?.metrics?.sampleSize ?? 0} · expectancy {reviews[0]?.metrics?.expectancyR == null ? '—' : `${reviews[0].metrics.expectancyR.toFixed(2)}R`}{reviews[0]?.metrics?.sampleWarning ? ` · ${reviews[0].metrics.sampleWarning}` : ''}</div>}
          {journal.length || overview?.recentTrades.length ? <div className="space-y-2">{journal.slice(0, 4).map((entry, index) => { const rValue = entry.r_multiple ?? entry.outcome_r ?? entry.metrics?.rMultiple; return <div key={entry.id ?? index} className="flex justify-between gap-3 rounded-lg bg-bg/60 p-3 text-xs text-text"><span>{entry.symbol ?? 'Trade'} · {entry.setup_type ?? entry.metrics?.exitReason ?? 'paper'}</span><b>{rValue == null ? 'Outcome pending' : `${sign(rValue)}${rValue.toFixed(2)}R`}</b></div>; })}{!journal.length && overview?.recentTrades.slice(0, 4).map((trade) => <div key={trade.id} className="flex justify-between gap-3 rounded-lg bg-bg/60 p-3 text-xs text-text"><span>{trade.symbol} · {new Date(trade.closedAt).toLocaleDateString()}</span><b>{sign(trade.realizedPnl)}{money(trade.realizedPnl)}</b></div>)}</div> : <Empty>No completed trades or daily reviews yet. Paper results need a larger sample and are not evidence of future performance.</Empty>}
        </section>

        <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="research-title">
          <div className="mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /><h2 id="research-title" className="font-semibold text-text">Research integrity</h2></div>
          <p className="text-sm leading-6 text-muted">Small samples are anecdotes. Research needs a locked forward test, costs, buy-and-hold and seeded random baselines, confidence intervals, and a registered falsification criterion. No profitability or edge is claimed.</p>
        </section>
      </div>
    </PageFrame>
  </div>;
}

function Metric({ label, value, detail, warning = false }: { label: string; value: string; detail: string; warning?: boolean }) {
  return <article className={`rounded-xl border bg-surface p-4 ${warning ? 'border-warning/40' : 'border-border'}`}><div className="text-xs font-medium text-muted">{label}</div><div className="mt-2 text-lg font-semibold tabular-nums text-text">{value}</div><div className={`mt-1 text-xs ${warning ? 'text-warning' : 'text-muted'}`}>{detail}</div></article>;
}
function Empty({ children }: { children: ReactNode }) { return <p className="rounded-lg bg-bg/60 p-3 text-sm leading-6 text-muted">{children}</p>; }
function Pill({ children }: { children: ReactNode }) { return <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">{children}</span>; }
