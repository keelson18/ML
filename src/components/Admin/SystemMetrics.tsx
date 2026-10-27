import { useCallback, useEffect, useState } from 'react';
import { Activity, Database, RefreshCw, ShieldCheck, Timer, Wifi } from 'lucide-react';
import { fetchAdminOverview, type AdminOverview } from '../../lib/backend-api';

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail: string; icon: typeof Activity }) {
  return <article className="rounded-xl border border-border bg-bg/50 p-4">
    <div className="flex items-center gap-2 text-muted"><Icon className="h-4 w-4 text-primary" /><h3 className="text-sm font-medium">{label}</h3></div>
    <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
    <p className="mt-1 break-words text-xs text-muted">{detail}</p>
  </article>;
}

export default function SystemMetrics() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setOverview(await fetchAdminOverview()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'System metrics are unavailable.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const feedsUp = overview?.feeds.filter((feed) => feed.status === 'ok').length ?? 0;
  const providersReady = overview?.providers.filter((provider) => provider.status === 'ok').length ?? 0;
  const verifiedAccounts = overview?.ledger.hashChain.checkedAccounts ?? 0;
  const schemaValue = !overview ? '—' : overview.schema.status === 'ok' ? 'Ready' : overview.schema.status.toUpperCase();

  return <section className="space-y-5" aria-busy={loading}>
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">System overview</h2><p className="mt-1 text-sm text-muted">Live operational metrics from the admin health service. Values are measured, never estimated.</p></div><div className="flex items-center gap-3"><span className="text-xs text-muted">{overview ? `Updated ${new Date(overview.generatedAt).toLocaleTimeString()}` : 'Not yet updated'}</span><button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh system metrics" className="min-h-11 min-w-11 rounded-lg border border-border hover:bg-bg disabled:opacity-50"><RefreshCw className={`mx-auto h-4 w-4 text-muted ${loading ? 'animate-spin' : ''}`} /></button></div></header>
    {error && <div role="alert" className="rounded-lg border border-danger/25 bg-danger/10 p-3 text-sm text-danger">System metrics could not be loaded: {error}</div>}
    {loading && !overview ? <p className="py-8 text-center text-sm text-muted">Loading system metrics…</p> : overview && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label="Database schema" value={schemaValue} detail={overview.schema.reason} icon={Database} />
        <Metric label="Paper autopilot accounts" value={overview.autopilot.enrolledAccounts} detail={`${overview.autopilot.pausedAccounts} paused · ${overview.autopilot.symbolsInUse}/${overview.autopilot.symbolCap} symbols configured`} icon={Activity} />
        <Metric label="Scheduler" value={overview.scheduler.state} detail={`${overview.scheduler.running ? 'Running' : 'Stopped'} · ${overview.scheduler.activeLeaseCount} active leases · ${overview.scheduler.leaseContentionCount} lease conflicts · ${overview.scheduler.leaseClaimFailureCount + overview.scheduler.leaseRenewalFailureCount} lease failures · ${overview.scheduler.entriesEnabled ? 'new entries enabled' : 'existing positions only'}${overview.scheduler.lastCycleAt ? ` · last cycle ${new Date(overview.scheduler.lastCycleAt).toLocaleString()}` : ''}`} icon={Timer} />
        <Metric label="Market data providers" value={`${providersReady}/${overview.providers.length}`} detail={overview.providers.map((item) => `${item.provider}: ${item.status}`).join(' · ')} icon={Wifi} />
        <Metric label="Live feeds" value={`${feedsUp}/${overview.feeds.length}`} detail={overview.feeds.map((item) => `${item.feed}: ${item.connectedClients} clients · ${item.droppedUpdates} dropped`).join(' · ')} icon={Activity} />
        <Metric label="Ledger verification" value={overview.ledger.hashChain.status} detail={`${verifiedAccounts} accounts checked · ${overview.ledger.hashChain.checkedRows} rows verified · ${overview.ledger.hashChain.brokenAccounts} failures`} icon={ShieldCheck} />
        <Metric label="Accounting checks" value={`${overview.ledger.accounting.checkedAccounts} checked`} detail={`${overview.ledger.accounting.brokenAccounts} failures · ${overview.ledger.accounting.reason}`} icon={Database} />
        <Metric label="Admin access denials · 24h" value={overview.auditDenials24h.status === 'unverified' ? 'Unavailable' : overview.auditDenials24h.count} detail={overview.auditDenials24h.reason} icon={ShieldCheck} />
      </div>
      {error && <p role="status" className="text-xs text-warning">Showing the last successfully loaded metrics.</p>}
    </>}
  </section>;
}
