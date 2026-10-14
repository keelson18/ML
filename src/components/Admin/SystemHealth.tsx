import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchAdminOverview, requestFullLedgerReverification, type AdminOverview } from '../../lib/backend-api';
import type { ReactNode } from 'react';

const statusStyles = {
  ok: 'border-success/30 bg-success/10 text-success',
  degraded: 'border-warning/30 bg-warning/10 text-warning',
  down: 'border-danger/30 bg-danger/10 text-danger',
  unverified: 'border-border bg-bg text-muted',
} as const;

function HealthCard({ title, status, reason, children }: { title: string; status: string; reason: string; children?: ReactNode }) {
  const style = statusStyles[status as keyof typeof statusStyles] ?? statusStyles.unverified;
  return <article className="min-w-0 rounded-xl border border-border bg-surface p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase ${style}`}>{status}</span>
    </div>
    <p className="mt-2 break-words text-xs text-muted">{reason}</p>
    {children}
  </article>;
}

function ageLabel(ageMs: number | null) {
  if (ageMs === null) return 'Unavailable';
  if (ageMs < 60_000) return `${Math.floor(ageMs / 1000)}s`;
  if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)}m`;
  return `${Math.floor(ageMs / 3_600_000)}h`;
}

export default function SystemHealth({ onEnvironment }: { onEnvironment: (environment: 'test' | 'production') => void }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [reverifying, setReverifying] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  const refresh = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const next = await fetchAdminOverview();
      setOverview(next);
      onEnvironment(next.environment);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onEnvironment]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, overview?.refreshIntervalMs ?? 30_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [overview?.refreshIntervalMs, refresh]);

  const stale = Boolean(overview && Date.now() - Date.parse(overview.generatedAt) > (overview.refreshIntervalMs ?? 30_000) * 2);
  const showLoading = loading && !overview;
  const ledger = overview?.ledger;

  return <section className="space-y-4" aria-busy={showLoading || refreshing}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-base font-semibold">System health</h2><p className="mt-1 text-xs text-muted">Read-only operational status; diagnostics never make provider requests.</p></div>
      <div className="flex items-center gap-3">
        <span className="text-[10px] text-muted">{overview ? `Last updated ${new Date(overview.generatedAt).toLocaleTimeString()}` : 'Not yet updated'}{stale ? ' · stale' : ''}</span>
        <button type="button" onClick={() => void refresh(true)} disabled={refreshing} aria-label="Refresh system health" className="rounded-lg border border-border p-2 hover:bg-bg disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /></button>
      </div>
    </div>
    {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">{overview ? 'Refresh failed; showing stale health data.' : 'System health is unavailable.'}</p>}
    {showLoading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{['Schema', 'Ledger hash chain', 'Cash/equity accounting', 'Scheduler', 'Providers', 'Live feeds', 'Data freshness', 'Autopilot'].map((title) => <HealthCard key={title} title={title} status="loading" reason="Checking status…" />)}</div>
      : !overview ? <p className="rounded-lg border border-border bg-bg p-4 text-sm text-muted">Health sources are unavailable; no systems are assumed healthy.</p>
        : <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <HealthCard title="Schema" status={overview.schema.status} reason={overview.schema.reason}><p className="mt-2 text-[10px] text-muted">{overview.schema.missing.length ? `Missing: ${overview.schema.missing.join(', ')}` : 'Schema details are limited to the verifier result.'}</p></HealthCard>
            <HealthCard title="Ledger hash chain" status={ledger?.hashChain.status ?? 'unverified'} reason={ledger?.hashChain.reason ?? 'Unavailable'}><p className="mt-2 text-[10px] text-muted">{ledger?.hashChain.checkedAccounts ?? 0} accounts checked · {ledger?.hashChain.brokenAccounts ?? 0} broken · {ledger?.hashChain.checkedRows ?? 0} new rows verified</p><button type="button" disabled={reverifying} onClick={() => { const reason = window.prompt('Reason for a full ledger re-verification?'); if (reason?.trim()) { setReverifying(true); setActionMessage('Full verification is running…'); void requestFullLedgerReverification(reason.trim()).then(() => { setActionMessage('Full ledger re-verification completed and audited.'); return refresh(true); }).catch(() => setActionMessage('Full ledger re-verification was denied or unavailable.')).finally(() => setReverifying(false)); } }} className="mt-3 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-bg disabled:opacity-50">{reverifying ? 'Verifying…' : 'Full re-verify (AAL2)'}</button>{actionMessage && <p role="status" className="mt-2 text-[10px] text-muted">{actionMessage}</p>}</HealthCard>
            <HealthCard title="Cash/equity accounting" status={ledger?.accounting.status ?? 'unverified'} reason={ledger?.accounting.reason ?? 'Unavailable'}><p className="mt-2 text-[10px] text-muted">{ledger?.accounting.checkedAccounts ?? 0} accounts checked · {ledger?.accounting.brokenAccounts ?? 0} failures</p></HealthCard>
            <HealthCard title="Paper trading worker" status={overview.scheduler.status} reason={`Worker state: ${overview.scheduler.state}. ${overview.scheduler.reason}`}><p className="mt-2 break-words text-[10px] text-muted">Worker enabled {String(overview.scheduler.enabled)} · entries enabled {String(overview.scheduler.entriesEnabled)} · active {String(overview.scheduler.running)} · cycle in progress {String(overview.scheduler.cycleInProgress)} · last cycle {overview.scheduler.lastCycleAt ? new Date(overview.scheduler.lastCycleAt).toLocaleString() : 'unverified'} · next {overview.scheduler.nextScheduledAt ? new Date(overview.scheduler.nextScheduledAt).toLocaleString() : 'unverified'}{overview.scheduler.lastError ? ` · ${overview.scheduler.lastError}` : ''}</p><p className="mt-2 break-words text-[10px] text-muted">Last processed boundaries: {Object.entries(overview.scheduler.lastBoundaries).length ? Object.entries(overview.scheduler.lastBoundaries).map(([timeframe, boundary]) => `${timeframe} ${new Date(boundary * 1000).toLocaleString()}`).join(' · ') : 'unverified'}</p></HealthCard>
            <HealthCard title="Autopilot" status={overview.autopilot.status} reason={overview.autopilot.reason}><p className="mt-2 text-[10px] text-muted">{overview.autopilot.enrolledAccounts} enrolled · {overview.autopilot.pausedAccounts} paused · {overview.autopilot.symbolsInUse} of {overview.autopilot.symbolCap} symbols in use</p>{overview.autopilot.pausedReasons.length > 0 && <ul className="mt-2 list-inside list-disc break-words text-[10px] text-muted">{overview.autopilot.pausedReasons.map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}</ul>}</HealthCard>
            <HealthCard title="Admin denials · 24h" status={overview.auditDenials24h.status} reason={overview.auditDenials24h.reason}><p className="mt-2 text-[10px] text-muted">{overview.auditDenials24h.status === 'unverified' ? 'Unavailable' : overview.auditDenials24h.count}</p></HealthCard>
          </div>
          <section className="space-y-3 rounded-xl border border-border bg-bg/50 p-4">
            <h3 className="text-sm font-semibold">Provider request budgets</h3>
            <div className="grid gap-2 md:grid-cols-2">{overview.providers.map((provider) => <HealthCard key={provider.provider} title={provider.provider} status={provider.status} reason={provider.reason}><p className="mt-2 break-words text-[10px] text-muted">{provider.usedInWindow} / {provider.quota} per {Math.round(provider.windowMs / 1000)}s · {provider.queued} queued · backoff {provider.backoffUntil ?? 'none'} · last 429 {provider.last429At ?? 'none recorded'}</p></HealthCard>)}</div>
          </section>
          <section className="space-y-3 rounded-xl border border-border bg-bg/50 p-4">
            <h3 className="text-sm font-semibold">Live feeds</h3>
            <div className="grid gap-2 md:grid-cols-2">{overview.feeds.map((feed) => <HealthCard key={feed.feed} title={feed.feed} status={feed.status} reason={feed.reason}><p className="mt-2 break-words text-[10px] text-muted">{feed.subscribedSymbols} symbols · {feed.connectedClients} clients · {feed.droppedUpdates} dropped · {feed.reconnects} reconnects · {feed.gaps} gaps · last tick {ageLabel(feed.lastTickAgeMs)} ago</p></HealthCard>)}</div>
          </section>
          <section className="space-y-3 rounded-xl border border-border bg-bg/50 p-4">
            <h3 className="text-sm font-semibold">Cached candle freshness</h3>
            {overview.freshness.length ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{overview.freshness.map((item) => <HealthCard key={`${item.symbol}:${item.timeframe}`} title={`${item.symbol} · ${item.timeframe}`} status={item.status} reason={item.reason}><p className="mt-2 text-[10px] text-muted">Age {ageLabel(item.ageMs)} · newest closed {item.newestClosedCandleAt ? new Date(item.newestClosedCandleAt).toLocaleString() : 'unverified'}</p></HealthCard>)}</div> : <p className="rounded-lg border border-border bg-surface p-3 text-xs text-muted">No enabled autopilot symbols are available for freshness checks.</p>}
          </section>
        </>}
  </section>;
}
