import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { UserProfile, UserRole } from '../lib/types';

interface AuthCtx {
  session: Session | null;
  user: User | null;
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
        fetchProfile(sess.user.id);
      }
      setLoading(false);
    });
    // onAuthStateChange: wrap async work to avoid deadlock (per Supabase guidance).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      (async () => {
        setSession(sess);
        if (sess?.user) {
          await fetchProfile(sess.user.id);
        } else {
          setProfile(null);
        }
      })();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signUp = async (
    email: string,
    password: string,
    role: UserRole = 'user',
    metadata?: { first_name?: string; last_name?: string; phone?: string },
  ) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role, ...metadata },
      },
    });
    return { error: error ? (error.message ?? 'Sign up failed') : null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? (error.message ?? 'Sign in failed') : null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (session?.user) {
      await fetchProfile(session.user.id);
    }
  };

  return (
    <Ctx.Provider value={{
      session,
      user: session?.user ?? null,
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
