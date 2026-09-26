import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase, type Session } from '../lib/supabase';
import { authApi } from '../api';
import type { UserProfile, UserRole } from '../lib/types';

interface AuthCtx {
  session: Session | null;
  user: { id: string; email: string } | null;
  profile: UserProfile | null;
  loading: boolean;
  signUp: (email: string, password: string, role?: UserRole, metadata?: { first_name?: string; last_name?: string; phone?: string }) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (data) {
        setProfile({
          id: data.id,
          role: data.role as UserRole,
          displayName: data.display_name,
          avatarUrl: data.avatar_url,
          createdAt: data.created_at,
        });
      }
    } catch {
      // Profile may not exist yet (trigger hasn't fired)
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const sess = data.session;
      setSession(sess);
      if (sess?.user) {
        setUser({ id: sess.user.id, email: sess.user.email ?? '' });
        fetchProfile(sess.user.id);
      }
      setLoading(false);
    });
    // onAuthStateChange: wrap async work to avoid deadlock (per Supabase guidance).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      (async () => {
        setSession(newSession);
        if (newSession) {
          setUser({ id: newSession.user.id, email: newSession.user.email ?? '' });
          await fetchProfile(newSession.user.id);
        } else {
          setUser(null);
          setProfile(null);
        }
        setLoading(false);
      })();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signUp = async (
    email: string,
    password: string,
    _role: UserRole = 'user',
    metadata?: { first_name?: string; last_name?: string; phone?: string },
  ) => {
    try {
      await authApi.signUp(email, password, _role, metadata);
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Sign up failed' };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const result = await authApi.signIn(email, password);
      setSession(result.session);
      setUser(result.user);
      if (result.profile) {
        setProfile({
          id: result.profile.id,
          role: result.profile.role as UserRole,
          displayName: result.profile.displayName,
          avatarUrl: result.profile.avatarUrl,
          createdAt: result.profile.createdAt,
        });
      }
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Sign in failed' };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  return (
    <Ctx.Provider value={{
      session,
      user,
      profile,
      loading,
      signUp,
      signIn,
      signOut,
      refreshProfile,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
