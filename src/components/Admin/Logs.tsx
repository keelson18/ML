import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, RefreshCw } from 'lucide-react';
import { authApi, type AdminAuditEvent } from '../../api';

export default function Logs() {
  const [logs, setLogs] = useState<AdminAuditEvent[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await authApi.getAdminAuditEvents();
      setLogs(result.events);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Admin audit history is unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return query ? logs.filter((log) => `${log.action} ${log.actor_id} ${log.target_user_id ?? ''} ${JSON.stringify(log.details)}`.toLowerCase().includes(query)) : logs;
  }, [filter, logs]);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-sm font-semibold">System audit logs</h3><p className="mt-1 text-xs text-muted">Recent administrative actions recorded by the backend.</p></div>
      <div className="flex items-center gap-2"><input value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter audit logs" placeholder="Filter activity" className="min-h-11 rounded-lg border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:border-primary" /><button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh audit logs" className="min-h-11 min-w-11 rounded-lg border border-border hover:bg-bg disabled:opacity-50"><RefreshCw className={`mx-auto h-4 w-4 text-muted ${loading ? 'animate-spin' : ''}`} /></button></div>
    </div>
    {error && <div role="alert" className="rounded-lg border border-danger/20 bg-danger/10 p-3 text-sm text-danger">Could not load system audit records: {error}</div>}
    {loading ? <div className="py-8 text-center text-sm text-muted">Loading audit records…</div> : !error && filtered.length ? <div className="max-h-[560px] space-y-2 overflow-y-auto">{filtered.map((log) => <article key={log.id} className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 rounded-lg border border-border/50 bg-bg/40 px-3 py-3 sm:grid-cols-[auto_1fr_auto]"><FileText className="row-span-2 mt-1 h-4 w-4 text-primary" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><time className="text-xs text-muted">{new Date(log.created_at).toLocaleString()}</time><span className="text-sm font-medium text-text">{log.action}</span></div><p className="mt-1 break-words text-xs text-muted">Actor {log.actor_id}{log.target_user_id ? ` · Target ${log.target_user_id}` : ''}</p></div><details className="col-start-2 text-xs text-muted sm:col-start-3"><summary className="min-h-11 cursor-pointer py-3">Details</summary><pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded bg-surface p-2">{JSON.stringify(log.details, null, 2)}</pre></details></article>)}</div> : !error && <div className="py-8 text-center text-sm text-muted">{logs.length ? 'No audit records match this filter.' : 'No administrative audit records have been recorded yet.'}</div>}
  </div>;
}
