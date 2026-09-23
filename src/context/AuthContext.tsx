import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi, type AuthSession, setAuthToken, getAuthToken } from '../api';
import type { UserProfile, UserRole } from '../lib/types';

interface AuthCtx {
  session: AuthSession['session'] | null;
  user: AuthSession['user'] | null;
  profile: UserProfile | null;
  loading: boolean;
  signUp: (email: string, password: string, role?: UserRole, metadata?: { first_name?: string; last_name?: string; phone?: string }) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession['session'] | null>(null);
  const [user, setUser] = useState<AuthSession['user'] | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const applyProfile = (p: UserProfile | null) => {
    if (p) {
      setProfile({
        id: p.id,
        role: p.role as UserRole,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        createdAt: p.createdAt,
      });
    }
  };

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { profile: fetched } = await authApi.getProfile();
        if (cancelled) return;
        if (fetched) {
          applyProfile(fetched);
          setUser({ id: fetched.id, email: '' });
          setSession({ access_token: token, refresh_token: '', expires_at: 0 });
        } else {
          setAuthToken(null);
        }
      } catch {
        if (!cancelled) setAuthToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const signUp = async (
    email: string,
    password: string,
    role: UserRole = 'user',
    metadata?: { first_name?: string; last_name?: string; phone?: string },
  ) => {
    try {
      await authApi.signUp(email, password, role, metadata);
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
      setAuthToken(result.session.access_token);
      applyProfile(result.profile);
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Sign in failed' };
    }
  };

  const signOut = async () => {
    setAuthToken(null);
    setSession(null);
    setUser(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    try {
      const { profile: fetched } = await authApi.getProfile();
      applyProfile(fetched);
    } catch {
      // ignore
    }
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
