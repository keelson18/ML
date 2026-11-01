import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, ClipboardList, Clock3, RefreshCw, ShieldCheck } from 'lucide-react';
import PageFrame from '../PageFrame';
import { fetchActiveEventBlackouts, fetchAutonomyStatus, fetchBackendHealth, fetchTraderAutopilot, fetchTraderHistory, fetchTraderOverview, fetchTraderPlans, refreshTraderPlans, runTraderAutopilotNow, updateTraderAutopilot, type AutonomyStatus, type BackendHealth, type EventBlackout, type TraderAutopilotRunResult, type TraderAutopilotSettings, type TraderOverview, type TraderPlan } from '../../lib/backend-api';
import { MARKET_UNIVERSE } from '../../lib/markets';

const AUTOPILOT_MARKETS = MARKET_UNIVERSE.filter((market) => market.isActive && ['massive', 'twelvedata'].includes(market.provider) && market.marketType === 'crypto' && market.priceCurrency === 'USD');

type Review = { review_date?: string; reviewDate?: string; metrics?: { sampleSize?: number; sampleWarning?: string; expectancyR?: number | null } };
type Journal = { id?: string; symbol?: string; setup_type?: string; outcome_r?: number; r_multiple?: number; created_at?: string; status?: string; active_event_ids?: string[]; metrics?: { rMultiple?: number; maeR?: number | null; mfeR?: number | null; pnl?: number; exitReason?: string } };
type BiasRow = { bias: string; regime: string; keyLevels: number[]; qualityScore: number; reason: string };

function money(value: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value); }
function sign(value: number) { return value >= 0 ? '+' : ''; }

export default function TraderDesk() {
  const [plans, setPlans] = useState<TraderPlan[]>([]);
  const [overview, setOverview] = useState<TraderOverview | null>(null);
  const [backendHealth, setBackendHealth] = useState<BackendHealth | null>(null);
  const [autonomy, setAutonomy] = useState<AutonomyStatus | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [journal, setJournal] = useState<Journal[]>([]);
  const [bias, setBias] = useState<BiasRow[]>([]);
  const [eventBlackouts, setEventBlackouts] = useState<EventBlackout[]>([]);
  const [eventCalendarError, setEventCalendarError] = useState(false);
  const [autopilot, setAutopilot] = useState<TraderAutopilotSettings | null>(null);
  const [autopilotEnabled, setAutopilotEnabled] = useState(false);
  const [autopilotSymbols, setAutopilotSymbols] = useState<string[]>([]);
  const [autopilotDirty, setAutopilotDirty] = useState(false);
  const [autopilotRun, setAutopilotRun] = useState<TraderAutopilotRunResult | null>(null);
  const [autopilotBusy, setAutopilotBusy] = useState(false);
  const [autopilotError, setAutopilotError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [planResult, overviewResult, autonomyResult, autopilotResult, reviewResult, journalResult, eventsResult, healthResult] = await Promise.allSettled([
      fetchTraderPlans(), fetchTraderOverview(), fetchAutonomyStatus(), fetchTraderAutopilot(), fetchTraderHistory<Review>('reviews'), fetchTraderHistory<Journal>('journal'), fetchActiveEventBlackouts(), fetchBackendHealth(),
    ]);
    if (planResult.status === 'fulfilled') setPlans(planResult.value);
    if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value);
    if (healthResult.status === 'fulfilled') setBackendHealth(healthResult.value);
    if (autonomyResult.status === 'fulfilled') setAutonomy(autonomyResult.value);
    if (autopilotResult.status === 'fulfilled') {
      setAutopilot(autopilotResult.value);
      if (!autopilotDirty) { setAutopilotEnabled(autopilotResult.value.enabled); setAutopilotSymbols(autopilotResult.value.symbols); }
    }
    if (reviewResult.status === 'fulfilled') setReviews(reviewResult.value);
    if (journalResult.status === 'fulfilled') setJournal(journalResult.value);
    if (eventsResult.status === 'fulfilled') { setEventBlackouts(eventsResult.value); setEventCalendarError(false); }
    else setEventCalendarError(true);
    setHistoryError(reviewResult.status === 'rejected' || journalResult.status === 'rejected');
    if (planResult.status === 'rejected' && overviewResult.status === 'rejected') setError('Trader Desk data is unavailable. Check backend health and whether the latest Trader Desk migration has been applied.');
    setLoading(false);
  }, [autopilotDirty]);

  useEffect(() => { void load(); const timer = window.setInterval(() => { void load(); }, 60_000); return () => window.clearInterval(timer); }, [load]);

  const saveAutopilot = async () => {
    setAutopilotBusy(true);
    setAutopilotError(null);
    try {
      const saved = await updateTraderAutopilot({ enabled: autopilotEnabled, symbols: autopilotSymbols });
      setAutopilot(saved);
      setAutopilotEnabled(saved.enabled);
      setAutopilotSymbols(saved.symbols);
      setAutopilotDirty(false);
    } catch (cause) {
      setAutopilotError(cause instanceof Error ? cause.message : 'Could not save paper autopilot settings.');
    } finally { setAutopilotBusy(false); }
  };

  const runAutopilot = async () => {
    setAutopilotBusy(true);
    setAutopilotError(null);
    try {
      setAutopilotRun(await runTraderAutopilotNow());
      const current = await fetchTraderAutopilot();
      setAutopilot(current);
      setAutopilotEnabled(current.enabled);
      setAutopilotSymbols(current.symbols);
      setAutopilotDirty(false);
      await load();
    } catch (cause) {
      setAutopilotError(cause instanceof Error ? cause.message : 'Paper autopilot could not run.');
    } finally { setAutopilotBusy(false); }
  };

  const refresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      const result = await refreshTraderPlans();
      setPlans(result.plans);
      setBias(result.watchlist);
      const fresh = await fetchTraderOverview();
      setOverview(fresh);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not refresh the plan board.');
    } finally { setRefreshing(false); }
  };

  const waitingPlans = useMemo(() => plans.filter((plan) => ['WATCHING', 'ARMED', 'PENDING_ORDER'].includes(plan.status)), [plans]);
  const dailyLossLimitPct = overview?.dailyLossLimitPct ?? 0;
  const weeklyLossLimitPct = overview?.weeklyLossLimitPct ?? 0;
  const dailyLossUsed = overview && overview.equity > 0 && dailyLossLimitPct > 0 ? Math.max(0, -overview.dailyPnl) / (overview.equity * dailyLossLimitPct / 100) * 100 : 0;
  const weeklyLossUsed = overview && overview.equity > 0 && weeklyLossLimitPct > 0 ? Math.max(0, -overview.weeklyPnl) / (overview.equity * weeklyLossLimitPct / 100) * 100 : 0;

  return <div className="dashboard-page px-4 py-5 lg:px-6">
    <PageFrame title="Trader Desk" eyebrow="Plan · Execute · Review" description="A paper trading workspace built around written plans, confirmed triggers, and risk limits." icon={ClipboardList}
      actions={<button type="button" onClick={() => void refresh()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text hover:border-primary/40 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />{refreshing ? 'Scanning markets' : 'Refresh plans'}</button>}>
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-text">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <div><strong>Paper trading only — not financial advice.</strong> Results are simulated and do not predict real performance.</div>
      </div>
      {error && <div role="alert" className="mb-5 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
      {loading && <div className="mb-5 rounded-xl border border-border bg-surface p-4 text-sm text-muted">Loading paper account and plan history…</div>}
      {backendHealth && !backendHealth.schema.ok && <div role="alert" className="mb-5 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{backendHealth.schema.failure === 'schema' ? 'Database migrations not applied' : `Database readiness blocked (${backendHealth.schema.failure ?? 'unknown'})`}: {backendHealth.schema.missing.join(', ')}</div>}

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Paper account and risk">
        <Metric label="Paper equity" value={overview ? money(overview.equity) : '—'} detail={overview ? `${money(overview.cash)} cash · ${money(overview.unrealizedPnl)} unrealized` : 'Account snapshot unavailable'} />
        <Metric label="Open risk / heat" value={overview ? `${money(overview.openRiskCash)} · ${overview.heatPct.toFixed(2)}%` : '—'} detail="Risk to current stops across open positions" />
        <Metric label="Daily loss limit" value={overview ? (dailyLossLimitPct > 0 ? `${money(Math.max(0, -overview.dailyPnl))} / ${money(overview.equity * dailyLossLimitPct / 100)}` : 'No limit set') : '—'} detail={overview ? (dailyLossLimitPct > 0 ? `${Math.min(100, dailyLossUsed).toFixed(0)}% of configured limit used` : 'No configured daily loss limit') : 'Daily loss limits unavailable'} warning={dailyLossLimitPct > 0 && dailyLossUsed >= 75} />
        <Metric label="Weekly loss limit" value={overview ? (weeklyLossLimitPct > 0 ? `${money(Math.max(0, -overview.weeklyPnl))} / ${money(overview.equity * weeklyLossLimitPct / 100)}` : 'No limit set') : '—'} detail={overview ? (weeklyLossLimitPct > 0 ? `${Math.min(100, weeklyLossUsed).toFixed(0)}% of configured limit used` : 'No configured weekly loss limit') : 'Weekly loss limits unavailable'} warning={weeklyLossLimitPct > 0 && weeklyLossUsed >= 75} />
      </section>

      {eventCalendarError && <div role="alert" className="mb-5 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">Event calendar health could not be verified. New entries are paused until the market calendar is refreshed.</div>}
      {!!eventBlackouts.length && <div role="status" className="mb-5 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning"><strong>Event blackout active.</strong> {eventBlackouts.map((event) => `${event.title} (${event.ticker ?? 'market'})`).join(', ')}</div>}
      {!!overview?.staleSymbols.length && <div role="status" className="mb-5 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">Stale price data: {overview.staleSymbols.join(', ')}</div>}
      {overview && <div role="status" className={`mb-5 rounded-xl border p-3 text-sm ${overview.ledgerStatus === 'broken' || !overview.reconciliation.ok ? 'border-danger/30 bg-danger/10 text-danger' : 'border-success/30 bg-success/10 text-success'}`}><strong>{overview.ledgerStatus === 'broken' || !overview.reconciliation.ok ? 'Ledger reconciliation issue' : 'Ledger verified'}</strong> · Expected equity {money(overview.reconciliation.expectedEquity)} · Actual equity {money(overview.reconciliation.actualEquity)} · Difference {money(overview.reconciliation.difference)}</div>}
      <section className="mb-6 rounded-xl border border-border bg-surface p-4" aria-labelledby="autopilot-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 id="autopilot-title" className="font-semibold text-text">Paper autopilot</h2><p className="mt-1 text-xs text-muted">Server-scheduled, opt-in execution; it runs only for this account and the monitored crypto markets.</p></div>
          <span className={`rounded-full px-2.5 py-1 text-xs ${autopilot?.enabled ? 'bg-success/10 text-success' : 'bg-bg text-muted'}`}>{autopilot ? (autopilot.enabled ? 'Enabled' : 'Off') : 'Status unavailable'}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-text"><input type="checkbox" checked={autopilotEnabled} onChange={(event) => { setAutopilotEnabled(event.target.checked); setAutopilotDirty(true); }} className="h-4 w-4 accent-primary" />Enable autopilot</label>
          <div className="text-xs text-muted">Last run: {autopilot?.lastRunAt ? new Date(autopilot.lastRunAt).toLocaleString() : 'Not run yet'}</div>
        </div>
        <fieldset className="mt-3"><legend className="text-xs font-medium text-text">Symbols (maximum {autopilot?.maxSymbolsPerUser ?? 0})</legend><div className="mt-2 flex flex-wrap gap-3">{AUTOPILOT_MARKETS.map((market) => <label key={market.symbol} className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={autopilotSymbols.includes(market.symbol)} onChange={(event) => { const next = event.target.checked ? [...autopilotSymbols, market.symbol] : autopilotSymbols.filter((symbol) => symbol !== market.symbol); setAutopilotSymbols(next); setAutopilotDirty(true); }} className="h-4 w-4 accent-primary" />{market.symbol}</label>)}</div></fieldset>
        {autopilot?.pausedReason && <p role="status" className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">Autopilot paused: {autopilot.pausedReason}. Existing positions continue to manage while this state is active.</p>}
        {autopilotRun?.queued && <p role="status" className="mt-3 text-xs text-muted">Run now queued on the server; check the paused status and last-run time after processing.</p>}
        {autopilotError && <p role="alert" className="mt-3 text-xs text-danger">{autopilotError}</p>}
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void saveAutopilot()} disabled={!autopilot || autopilotBusy || autopilotSymbols.length === 0} className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text disabled:opacity-50">Save settings</button><button type="button" onClick={() => void runAutopilot()} disabled={!autopilot || autopilotBusy} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-black disabled:opacity-50">Run now</button></div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="plans-title">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h2 id="plans-title" className="font-semibold text-text">Plans</h2><p className="mt-1 text-xs text-muted">Waiting for the next market trigger and valid risk gate.</p></div><span className="text-xs text-muted">{plans.length} active plans</span></div>
          {waitingPlans.length === 0 ? <Empty>No active plan. Most scans should end with no trade.</Empty> : <div className="space-y-3">{waitingPlans.map((plan) => <article key={plan.id} className="rounded-lg border border-border bg-bg/60 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><strong className="text-sm text-text">{plan.symbol}</strong><Pill>{plan.status}</Pill></div><span className="text-xs text-muted">{plan.grade}</span></div><p className="mt-2 text-sm text-text">{plan.thesis}</p>{plan.lastReason && <p className="mt-1 text-xs text-muted">Latest check: {plan.lastReason}</p>}<div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-3"><span>Zone: <b className="text-text">{plan.zone.low.toPrecision(6)}–{plan.zone.high.toPrecision(6)}</b></span><span>R:R minimum: {plan.minRR}:1</span><span>Expires at bar {plan.expiresAtBar}</span></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"><span>HTF: {plan.htfBias}</span><span>Setup: {plan.setupType}</span><span>Side: {plan.side}</span></div></article>)}</div>}
        </section>

        <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="bias-title">
          <div className="mb-4 flex items-center justify-between"><div><h2 id="bias-title" className="font-semibold text-text">Market bias board</h2><p className="mt-1 text-xs text-muted">Latest market regime and risk context from the server refresh.</p></div></div>
          {bias.length ? <div className="space-y-2">{bias.map((item, index) => <div key={`${item.bias}-${index}`} className="flex items-start justify-between gap-3 rounded-lg bg-bg/60 p-3"><div><div className="text-sm font-medium text-text">{item.bias}</div><div className="mt-1 text-xs text-muted">{item.regime}</div></div><div className="text-right text-xs text-muted"><div>{item.qualityScore.toFixed(0)} / 100</div><div className="mt-1">{item.keyLevels.join(', ')}</div></div></div>)}</div> : <Empty>No market bias data is available yet.</Empty>}
        </section>

        <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="positions-title">
          <div className="mb-4 flex items-center justify-between"><div><h2 id="positions-title" className="font-semibold text-text">Open positions</h2><p className="mt-1 text-xs text-muted">Mark-to-market positions and current risk state.</p></div></div>
          {!overview?.positions.length ? <Empty>No open paper positions.</Empty> : <div className="space-y-2">{overview.positions.map((position) => <div key={position.id} className="rounded-lg bg-bg/60 p-3"><div className="flex items-center justify-between gap-3"><strong className="text-sm text-text">{position.symbol}</strong><span className="text-xs text-muted">{position.side.toUpperCase()}</span></div><div className="mt-2 grid gap-1 text-xs text-muted sm:grid-cols-3"><span>Entry {money(position.entryPrice)}</span><span>Price {money(position.currentPrice)}</span><span>P&L {money(position.unrealizedPnl)}</span></div></div>)}</div>}
        </section>

        <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="why-title">
          <div className="mb-4 flex items-center justify-between"><div><h2 id="why-title" className="font-semibold text-text">Why no trade</h2><p className="mt-1 text-xs text-muted">Current reason and autonomy state for waiting plans.</p></div></div>
          {waitingPlans.length ? <div className="space-y-2">{waitingPlans.slice(0, 5).map((plan) => <div key={plan.id} className="rounded-lg bg-bg/60 p-3 text-sm text-text"><b>{plan.symbol}</b>: {plan.lastReason ?? 'No reason logged yet.'}</div>)}</div> : <Empty>No active plan is waiting for a trigger.</Empty>}
          <div className="mt-3 border-t border-border pt-3 text-xs text-muted">Autonomy: <b className="text-text">{autonomy?.state ?? 'status unavailable'}</b>{autonomy?.lastRunAt ? ` · last run ${new Date(autonomy.lastRunAt).toLocaleString()}` : ''}</div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="journal-title">
          <div className="mb-4 flex items-center justify-between"><div><h2 id="journal-title" className="font-semibold text-text">Journal & daily review</h2><p className="mt-1 text-xs text-muted">Latest trade journal and performance review events from the server.</p></div></div>
          {historyError && <p className="mb-3 text-xs text-warning">Journal/review history is unavailable. Apply the Trader Desk journal migration if it is pending.</p>}
          {reviews.length > 0 && <div className="mb-3 rounded-lg bg-bg/60 p-3 text-sm text-text">Latest review: {reviews[0]?.review_date ?? reviews[0]?.reviewDate ?? 'date unavailable'} · n={reviews[0]?.metrics?.sampleSize ?? 0}</div>}
          {journal.length || overview?.recentTrades.length ? <div className="space-y-2">{journal.slice(0, 4).map((entry, index) => { const rValue = entry.r_multiple ?? entry.metrics?.rMultiple ?? entry.outcome_r ?? 0; const pnl = entry.metrics?.pnl ?? entry.outcome_r ?? 0; return <div key={entry.id ?? `${entry.symbol ?? 'journal'}-${index}`} className="rounded-lg bg-bg/60 p-3 text-xs text-muted"><div className="flex items-center justify-between gap-3"><strong className="text-sm text-text">{entry.symbol ?? 'Unnamed trade'}</strong><span>{entry.status ?? 'status unavailable'}</span></div><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1"><span>R: {rValue.toFixed(2)}</span><span>P&L: {money(pnl)}</span><span>{entry.created_at ? new Date(entry.created_at).toLocaleString() : 'time unavailable'}</span></div></div>; })}</div> : <Empty>No journal data recorded yet.</Empty>}
        </section>

        <section className="rounded-xl border border-border bg-surface p-4" aria-labelledby="research-title">
          <div className="mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /><h2 id="research-title" className="font-semibold text-text">Research integrity</h2></div>
          <p className="text-sm leading-6 text-muted">Small samples are anecdotes. Research needs a locked forward test, costs, buy-and-hold and seeded random baselines, confidence intervals, and a full provider provenance record before trade decisions are trusted.</p>
        </section>
      </div>
    </PageFrame>
  </div>;
}

function Metric({ label, value, detail, warning = false }: { label: string; value: string; detail: string; warning?: boolean }) {
  return <article className={`rounded-xl border bg-surface p-4 ${warning ? 'border-warning/40' : 'border-border'}`}><div className="text-xs font-medium text-muted">{label}</div><div className="mt-2 text-lg font-semibold text-text">{value}</div><div className="mt-1 text-xs text-muted">{detail}</div></article>;
}
function Empty({ children }: { children: ReactNode }) { return <p className="rounded-lg bg-bg/60 p-3 text-sm leading-6 text-muted">{children}</p>; }
function Pill({ children }: { children: ReactNode }) { return <span className="rounded-full border border-border px-2 py-0.5 text-xs uppercase tracking-wide text-muted">{children}</span>; }
