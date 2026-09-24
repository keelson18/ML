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

  const loadProfile = async (userId: string) => {
    const p = await authApi.fetchProfile(userId);
    if (p) {
      setProfile({
        id: p.id,
        role: p.role as UserRole,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        createdAt: p.createdAt,
      });
    } else {
      setProfile(null);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSession(data.session);
        setUser({ id: data.session.user.id, email: data.session.user.email ?? '' });
        (async () => {
          await loadProfile(data.session!.user.id);
          setLoading(false);
        })();
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      (async () => {
        setSession(newSession);
        if (newSession) {
          setUser({ id: newSession.user.id, email: newSession.user.email ?? '' });
          await loadProfile(newSession.user.id);
        } else {
          setUser(null);
          setProfile(null);
        }
        setLoading(false);
      })();
    });

    return () => subscription.unsubscribe();
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
    if (user) await loadProfile(user.id);
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
