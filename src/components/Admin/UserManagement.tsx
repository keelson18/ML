import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardList, RefreshCw, Shield, ShieldOff } from 'lucide-react';
import { authApi, type AdminAuditEvent, type AdminUser } from '../../api';
import { useAuth } from '../../context/AuthContext';

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [audit, setAudit] = useState<AdminAuditEvent[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await authApi.getAllProfiles(page, 20, appliedQuery);
      setUsers(result.users); setPages(Math.max(1, result.pages)); setTotal(result.total); setLoadError(false);
    } catch { setUsers([]); setLoadError(true); }
    finally { setLoading(false); }
  }, [appliedQuery, page]);

  useEffect(() => { void fetchUsers(); }, [fetchUsers]);
  useEffect(() => {
    const timer = window.setTimeout(() => { setAppliedQuery(query.trim()); setPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const fetchAudit = useCallback(async () => {
    try { setAudit((await authApi.getAdminAuditEvents()).events); } catch { setAudit([]); }
  }, []);
  useEffect(() => { void fetchAudit(); }, [fetchAudit]);

  const toggleRole = async (target: AdminUser) => {
    const role = target.role === 'admin' ? 'user' : 'admin';
    if (!window.confirm(`Change ${target.email} from ${target.role} to ${role}? This action is audited.`)) return;
    setUpdatingId(target.id); setActionError(null);
    try { await authApi.updateProfileRole(target.id, role); await fetchUsers(); await fetchAudit(); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Could not update this user role.'); }
    finally { setUpdatingId(null); }
  };

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-base font-semibold">User access</h2><p className="mt-1 text-xs text-muted">Search by email, name, ID, or role. Role changes are audited.</p></div>
      <div className="flex items-center gap-2"><label className="sr-only" htmlFor="admin-user-search">Search users</label><input id="admin-user-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search email, name, ID" className="w-40 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text placeholder:text-muted sm:w-56" />
        <button type="button" onClick={() => void fetchUsers()} disabled={loading} aria-label="Refresh users" className="rounded-lg border border-border p-2 hover:border-primary/40 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 text-muted ${loading ? 'animate-spin' : ''}`} /></button></div>
    </div>
    {actionError && <div role="alert" className="rounded-lg border border-danger/20 bg-danger/10 p-3 text-xs text-danger">{actionError}</div>}
    {loadError ? <div role="alert" className="rounded-lg border border-warning/25 bg-warning/5 p-4 text-sm text-warning">Could not load the user directory. Check admin access and retry.</div>
      : users.length === 0 && !loading ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">No matching user profiles.</div>
        : <div className="space-y-2">{users.map((person) => {
          const selfDemotion = person.id === currentUser?.id && person.role === 'admin';
          return <div key={person.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-bg/50 px-3 py-2">
            <div className="min-w-0"><div className="truncate text-sm font-medium">{person.displayName ?? 'Unknown'}</div><div className="truncate text-xs text-muted">{person.email || 'No email available'}</div><div className="text-[10px] text-muted">ID {person.id.slice(0, 8)} · joined {new Date(person.createdAt).toLocaleDateString()}</div></div>
            <button type="button" disabled={updatingId === person.id || selfDemotion} onClick={() => void toggleRole(person)} title={selfDemotion ? 'You cannot remove your own admin role.' : `Change role for ${person.email}`} className={`flex shrink-0 items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 ${person.role === 'admin' ? 'bg-primary/15 text-primary hover:bg-primary/25' : 'border border-border bg-surface text-muted hover:text-text'}`}>
              {person.role === 'admin' ? <><Shield className="h-3 w-3" /> Admin</> : <><ShieldOff className="h-3 w-3" /> User</>}
            </button>
          </div>;
        })}</div>}
    {!loadError && total > 0 && <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted"><span>{total} users · page {page} of {pages}</span><div className="flex gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded border border-border p-1.5 disabled:opacity-40" aria-label="Previous users page"><ChevronLeft className="h-4 w-4" /></button><button type="button" disabled={page >= pages || loading} onClick={() => setPage((value) => value + 1)} className="rounded border border-border p-1.5 disabled:opacity-40" aria-label="Next users page"><ChevronRight className="h-4 w-4" /></button></div></div>}
    <section className="border-t border-border pt-4"><div className="mb-3 flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Admin audit trail</h3></div>{audit.length ? <div className="max-h-64 space-y-2 overflow-y-auto">{audit.map((event) => <div key={event.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-bg/50 p-2 text-xs"><span>{event.action.replaceAll('_', ' ')} · target {event.target_user_id?.slice(0, 8) ?? 'system'}</span><span className="text-muted">{new Date(event.created_at).toLocaleString()}</span></div>)}</div> : <p className="text-xs text-muted">No admin events recorded yet, or audit history is unavailable.</p>}</section>
  </div>;
}
