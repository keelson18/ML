import { supabase } from '../lib/supabase';
import type { UserProfile, UserRole } from '../lib/types';

export interface AuthSession {
  session: { access_token: string; refresh_token: string; expires_at: number };
  user: { id: string; email: string };
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
      user: { id: userId, email: data.user.email ?? '' },
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

  async getAllProfiles(): Promise<{ profiles: UserProfile[] }> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, display_name, avatar_url, created_at')
      .order('created_at', { ascending: false });
    if (error || !data) return { profiles: [] };
    return {
      profiles: data.map((p) => ({
        id: p.id,
        role: p.role as UserRole,
        displayName: p.display_name ?? undefined,
        avatarUrl: p.avatar_url ?? undefined,
        createdAt: p.created_at,
      })),
    };
  },

  async updateProfileRole(userId: string, role: string): Promise<void> {
    await supabase.from('profiles').update({ role }).eq('id', userId);
  },
};
