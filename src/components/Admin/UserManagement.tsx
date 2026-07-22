import { useEffect, useState } from 'react';
import { Shield, ShieldOff, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { UserProfile } from '../../lib/types';

export default function UserManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) {
      setUsers(data.map((u) => ({
        id: u.id,
        role: u.role,
        displayName: u.display_name,
        avatarUrl: u.avatar_url,
        createdAt: u.created_at,
      })));
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);
    await fetchUsers();
  };

  if (loading) {
    return <div className="text-sm text-muted text-center py-8">Loading users…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">User Management ({users.length})</h3>
        <button
          onClick={fetchUsers}
          className="p-1.5 rounded hover:bg-bg transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5 text-muted" />
        </button>
      </div>
      <div className="space-y-1.5">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-bg/50 border border-border/50">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{u.displayName ?? 'Unknown'}</div>
              <div className="text-xs text-muted">ID: {u.id.slice(0, 8)}…</div>
              <div className="text-xs text-muted">Created: {new Date(u.createdAt).toLocaleDateString()}</div>
            </div>
            <button
              onClick={() => toggleRole(u.id, u.role)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                u.role === 'admin'
                  ? 'bg-primary/15 text-primary hover:bg-primary/25'
                  : 'bg-surface border border-border text-muted hover:text-text'
              }`}
              title="Toggle admin role"
            >
              {u.role === 'admin' ? (
                <><Shield className="w-3 h-3" /> Admin</>
              ) : (
                <><ShieldOff className="w-3 h-3" /> User</>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

