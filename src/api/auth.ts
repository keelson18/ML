import { supabase } from '../lib/supabase';
import type { Session } from '../lib/supabase';
import type { UserProfile, UserRole } from '../lib/types';
import { readJsonSafe } from '../../shared/http';

export interface AdminUser extends UserProfile { email: string }
export interface AdminUserPage { users: AdminUser[]; page: number; limit: number; total: number; pages: number }
export interface AdminAuditEvent { id: string; actor_id: string; target_user_id: string | null; action: string; details: Record<string, unknown>; created_at: string }

async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Authentication required.');
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${session.access_token}`);
  const response = await fetch(path, { ...init, headers });
  const { payload } = await readJsonSafe<T & { error?: string }>(response);
  if (!response.ok) throw new Error(payload?.error ?? `Admin request failed (${response.status}).`);
  if (payload === null) throw new Error('The server returned an empty or invalid response.');
  return payload;
}

export interface AuthSession {
  session: Session;
  user: { id: string; email: string; lastSignInAt?: string };
  profile: UserProfile | null;
}

export const authApi = {
  async signIn(email: string, password: string): Promise<AuthSession> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const userId = data.user.id;
    const profile = await authApi.fetchProfile(userId);
    return {
      session: data.session!,
      user: { id: userId, email: data.user.email ?? '', lastSignInAt: data.user.last_sign_in_at },
      profile,
    };
  },

  async signUp(email: string, password: string, _role: UserRole = 'user', metadata?: Record<string, unknown>) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    });
    if (error) throw new Error(error.message);
    return data;
  },

  async fetchProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, display_name, avatar_url, created_at')
      .eq('id', userId)
      .maybeSingle();
    if (error) return null;
    if (!data) return null;
    return {
      id: data.id,
      role: data.role as UserRole,
      displayName: data.display_name ?? undefined,
      avatarUrl: data.avatar_url ?? undefined,
      createdAt: data.created_at,
    };
  },

  async getProfile(): Promise<{ profile: UserProfile | null }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { profile: null };
    const profile = await authApi.fetchProfile(user.id);
    return { profile };
  },

  async getAllProfiles(page = 1, limit = 20, search = ''): Promise<AdminUserPage> {
    const query = new URLSearchParams({ page: String(page), limit: String(limit), search });
    return adminRequest<AdminUserPage>(`/api/v1/admin/users?${query}`);
  },

  async updateProfileRole(userId: string, role: string): Promise<void> {
    await adminRequest(`/api/v1/admin/users/${encodeURIComponent(userId)}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
  },

  async getAdminAuditEvents(): Promise<{ events: AdminAuditEvent[] }> {
    return adminRequest('/api/v1/admin/audit-events');
  },
};
