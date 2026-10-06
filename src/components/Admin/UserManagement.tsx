import { useEffect, useMemo, useState } from 'react';
import { Shield, ShieldOff, RefreshCw } from 'lucide-react';
import { authApi } from '../../api';
import type { UserProfile } from '../../lib/types';

export default function UserManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [query, setQuery] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { profiles } = await authApi.getAllProfiles();
      setUsers(profiles);
      setLoadError(false);
    } catch {
      setUsers([]);
      setLoadError(true);
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    setUpdatingId(userId);
    setActionError(false);
    try {
      await authApi.updateProfileRole(userId, newRole);
      await fetchUsers();
    } catch {
      setActionError(true);
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return normalizedQuery ? users.filter((user) => `${user.displayName ?? ''} ${user.id} ${user.role}`.toLowerCase().includes(normalizedQuery)) : users;
  }, [query, users]);

  if (loading) {
    return <div className="text-sm text-muted text-center py-8">Loading users…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-base font-semibold">User access</h2><p className="text-xs text-muted mt-1">Search accounts and review assigned roles.</p></div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="admin-user-search">Search users</label>
          <input id="admin-user-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, ID, role" className="w-40 sm:w-56 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text placeholder:text-muted focus:outline-none focus:border-primary" />
          <button type="button" onClick={fetchUsers} disabled={loading} aria-label="Refresh users" className="rounded-lg border border-border p-2 hover:border-primary/40 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 text-muted ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      {actionError && <div role="alert" className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg p-3">Could not update that user's role. Check your admin permissions and try again.</div>}
      {loadError ? <div role="alert" className="rounded-lg border border-warning/25 bg-warning/5 p-4 text-sm text-warning">Could not load the user directory. Check your sign-in and retry.</div> : users.length === 0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">No user profiles found.</div> : filteredUsers.length === 0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">No users match “{query}”.</div> : <div className="space-y-2">
        {filteredUsers.map((u) => (
          <div key={u.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-bg/50 border border-border/50">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{u.displayName ?? 'Unknown'}</div>
              <div className="text-xs text-muted">ID: {u.id.slice(0, 8)}…</div>
              <div className="text-xs text-muted">Created: {new Date(u.createdAt).toLocaleDateString()}</div>
            </div>
            <button
              type="button"
              disabled={updatingId === u.id}
              onClick={() => void toggleRole(u.id, u.role)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
                u.role === 'admin'
                  ? 'bg-primary/15 text-primary hover:bg-primary/25'
                  : 'bg-surface border border-border text-muted hover:text-text'
              }`}
              title={`Change ${u.displayName ?? 'user'} role to ${u.role === 'admin' ? 'user' : 'admin'}`}
            >
              {u.role === 'admin' ? (
                <><Shield className="w-3 h-3" /> Admin</>
              ) : (
                <><ShieldOff className="w-3 h-3" /> User</>
              )}
            </button>
          </div>
        ))}
      </div>}
    </div>
  );
}
