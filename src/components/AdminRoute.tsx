import { type ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

// Route guard that only renders children if the user has admin role.
// If not an admin, renders fallback (or nothing if no fallback provided).
export default function AdminRoute({ children, fallback }: Props) {
  const { profile, loading } = useAuth();
  const [assurance, setAssurance] = useState<'loading' | 'aal2' | 'required' | 'unavailable'>('loading');
  const requireAdminMfa = import.meta.env.VITE_REQUIRE_ADMIN_MFA === 'true';
  const [assuranceAttempt, setAssuranceAttempt] = useState(0);

  const checkAssurance = useCallback(async (active: () => boolean) => {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!active()) return;
      if (error || !data) {
        setAssurance('unavailable');
        return;
      }
      setAssurance(data.currentLevel === 'aal2' || (!requireAdminMfa && data.nextLevel !== 'aal2') ? 'aal2' : 'required');
    } catch {
      // Network failures reject this Supabase call instead of returning an error result.
      // Resolve to a retryable state so the admin page cannot remain stuck loading.
      if (active()) setAssurance('unavailable');
    }
  }, [requireAdminMfa]);

  useEffect(() => {
    if (!profile || profile.role !== 'admin') return;
    let active = true;
    setAssurance('loading');
    void checkAssurance(() => active);
    return () => { active = false; };
  }, [profile, checkAssurance, assuranceAttempt]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted">
        Loading…
      </div>
    );
  }

  if (!profile || profile.role !== 'admin') {
    return fallback ?? (
      <div className="flex items-center justify-center py-8 text-sm text-muted">
        Admin access required
      </div>
    );
  }

  if (assurance === 'loading') return <div className="flex items-center justify-center py-8 text-sm text-muted">Checking administrator assurance…</div>;
  if (assurance !== 'aal2') return <div role="alert" className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
    {assurance === 'required' ? 'Administrator access requires verified TOTP. Enroll an authenticator in Settings, then sign in again.' : <>
      <p>Administrator assurance could not be verified. Check your connection and retry.</p>
      <button type="button" onClick={() => setAssuranceAttempt((attempt) => attempt + 1)} className="mt-3 rounded border border-warning/40 px-3 py-1.5 font-semibold hover:bg-warning/10">Retry check</button>
    </>}
  </div>;
  return <>{children}</>;
}
