import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useCallback } from 'react';
import { supabase, type Session } from '../lib/supabase';
import { authApi } from '../api';
import type { UserProfile, UserRole } from '../lib/types';
import { requiresMfaChallenge } from '../lib/account-security';

interface AuthCtx {
  session: Session | null;
  user: { id: string; email: string; lastSignInAt?: string } | null;
  profile: UserProfile | null;
  loading: boolean;
  mfaChallengeRequired: boolean;
  verifyMfaChallenge: (code: string) => Promise<{ error: string | null }>;
  cancelMfaChallenge: () => Promise<void>;
  signUp: (email: string, password: string, role?: UserRole, metadata?: { first_name?: string; last_name?: string; phone?: string }) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<{ id: string; email: string; lastSignInAt?: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaChallengeRequired, setMfaChallengeRequired] = useState(false);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
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
  }, []);

  const applySession = useCallback(async (nextSession: Session | null) => {
    let challengeRequired = false;
    if (nextSession) {
      const [{ data: assurance, error: assuranceError }, { data: factors, error: factorsError }] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      challengeRequired = requiresMfaChallenge({
        currentLevel: assurance?.currentLevel, nextLevel: assurance?.nextLevel,
        hasVerifiedFactor: factors?.totp.some((factor) => factor.status === 'verified') === true,
        assuranceVerified: !assuranceError && !factorsError,
      });
    }
    setMfaChallengeRequired(challengeRequired);
    setSession(nextSession);
    if (nextSession && !challengeRequired) {
      setUser({ id: nextSession.user.id, email: nextSession.user.email ?? '', lastSignInAt: nextSession.user.last_sign_in_at });
      await fetchProfile(nextSession.user.id);
    } else {
      setUser(null);
      setProfile(null);
    }
  }, [fetchProfile]);

  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data }) => {
      await applySession(data.session);
      setLoading(false);
    }).catch(() => setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setLoading(true);
      queueMicrotask(() => { void applySession(nextSession).finally(() => setLoading(false)); });
    });
    return () => sub.subscription.unsubscribe();
  }, [applySession]);

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
      const [{ data: assurance, error: assuranceError }, { data: factors, error: factorsError }] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      const challengeRequired = requiresMfaChallenge({
        currentLevel: assurance?.currentLevel, nextLevel: assurance?.nextLevel,
        hasVerifiedFactor: factors?.totp.some((factor) => factor.status === 'verified') === true,
        assuranceVerified: !assuranceError && !factorsError,
      });
      setMfaChallengeRequired(challengeRequired);
      setSession(result.session);
      if (challengeRequired) {
        setUser(null);
        setProfile(null);
        return { error: null };
      }
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

  const verifyMfaChallenge = async (code: string) => {
    try {
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp.find((item) => item.status === 'verified');
      if (factorsError || !factor) return { error: 'Two-factor authentication could not be verified.' };
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (error) return { error: 'The authentication code was not accepted.' };
      setMfaChallengeRequired(false);
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        setUser({ id: currentUser.id, email: currentUser.email ?? '', lastSignInAt: currentUser.last_sign_in_at });
        await fetchProfile(currentUser.id);
      }
      return { error: null };
    } catch {
      return { error: 'Two-factor authentication could not be verified.' };
    }
  };

  const cancelMfaChallenge = async () => { await signOut(); };

  const signOut = async () => {
    await supabase.auth.signOut();
    setMfaChallengeRequired(false);
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
      mfaChallengeRequired,
      verifyMfaChallenge,
      cancelMfaChallenge,
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
