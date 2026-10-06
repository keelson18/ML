import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface AuditLog {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  correlation_id: string | null;
  created_at: string;
}

export default function Logs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const { data, error: queryError } = await supabase.from('audit_logs')
      .select('id,action,resource_type,resource_id,correlation_id,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (queryError) setError(true);
    else setLogs(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return query ? logs.filter((log) => `${log.action} ${log.resource_type} ${log.resource_id ?? ''} ${log.correlation_id ?? ''}`.toLowerCase().includes(query)) : logs;
  }, [filter, logs]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Audit Logs</h3><p className="text-[10px] text-muted mt-1">Recent records visible to your signed-in account.</p></div><div className="flex items-center gap-2"><input value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter audit logs" placeholder="Filter activity" className="px-2 py-1.5 rounded text-xs bg-surface border border-border text-text focus:outline-none focus:border-primary" /><button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh audit logs" className="p-1.5 rounded hover:bg-bg disabled:opacity-50"><RefreshCw className={`w-3.5 h-3.5 text-muted ${loading ? 'animate-spin' : ''}`} /></button></div></div>
      {error && <div role="alert" className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg p-3">Could not load audit records. Refresh your sign-in and retry if this continues.</div>}
      {loading ? <div className="text-sm text-muted text-center py-8">Loading audit records…</div> : !error && filtered.length ? <div className="space-y-1 max-h-[400px] overflow-y-auto">{filtered.map((log) => <div key={log.id} className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_1fr] items-start gap-x-3 gap-y-1 rounded-lg border border-border/50 bg-bg/40 px-3 py-2 text-xs"><FileText className="w-3.5 h-3.5 mt-0.5 row-span-2 sm:row-span-1 text-primary" /><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><time className="text-muted">{new Date(log.created_at).toLocaleString()}</time><span className="font-medium text-text">{log.action}</span></div><span className="text-muted sm:text-right">{log.resource_type}{log.resource_id ? ` · ${log.resource_id}` : ''}</span>{log.correlation_id && <span className="col-start-2 sm:col-start-2 sm:col-span-2 text-[10px] text-muted">Correlation ID: {log.correlation_id}</span>}</div>)}</div> : !error && <div className="text-sm text-muted text-center py-8">{logs.length ? 'No audit records match this filter.' : 'No audit records are available for this account yet.'}</div>}
    </div>
  );
}
