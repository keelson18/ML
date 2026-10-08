import { type ReactNode } from 'react';
import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!profile || profile.role !== 'admin') return;
    let active = true;
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data, error }) => {
      if (!active) return;
      if (error || !data) setAssurance('unavailable');
      else setAssurance(data.currentLevel === 'aal2' || (!requireAdminMfa && data.nextLevel !== 'aal2') ? 'aal2' : 'required');
    });
    return () => { active = false; };
  }, [profile, requireAdminMfa]);

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
  if (assurance !== 'aal2') return <div role="alert" className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">{assurance === 'required' ? 'Administrator access requires verified TOTP. Enroll an authenticator in Settings, then sign in again.' : 'Administrator assurance could not be verified.'}</div>;
  return <>{children}</>;
}
