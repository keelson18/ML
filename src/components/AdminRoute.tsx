import { type ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { listTotpFactors, verifyMfaChallenge, type TotpFactor } from '../lib/account-security';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

// Route guard that only renders children if the user has admin role.
// If not an admin, renders fallback (or nothing if no fallback provided).
export default function AdminRoute({ children, fallback }: Props) {
  const { profile, loading } = useAuth();
  const [assurance, setAssurance] = useState<'loading' | 'aal2' | 'required' | 'unavailable'>('loading');
  const [assuranceAttempt, setAssuranceAttempt] = useState(0);
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [factorsUnavailable, setFactorsUnavailable] = useState(false);
  const [code, setCode] = useState('');
  const [challengeError, setChallengeError] = useState('');
  const [challenging, setChallenging] = useState(false);

  const checkAssurance = useCallback(async (active: () => boolean) => {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!active()) return;
      if (error || !data) {
        setAssurance('unavailable');
        return;
      }
      setAssurance(data.currentLevel === 'aal2' ? 'aal2' : 'required');
    } catch {
      // Network failures reject this Supabase call instead of returning an error result.
      // Resolve to a retryable state so the admin page cannot remain stuck loading.
      if (active()) setAssurance('unavailable');
    }
  }, []);

  useEffect(() => {
    if (!profile || profile.role !== 'admin') return;
    let active = true;
    setAssurance('loading');
    void checkAssurance(() => active);
    return () => { active = false; };
  }, [profile, checkAssurance, assuranceAttempt]);

  useEffect(() => {
    if (assurance !== 'required') return;
    setFactorsUnavailable(false);
    void listTotpFactors().then(setFactors).catch(() => { setFactors([]); setFactorsUnavailable(true); });
  }, [assurance]);

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
    {assurance === 'required' ? <div className="space-y-3">
      {factorsUnavailable ? <><p>Authenticator status could not be loaded. Retry without changing your MFA settings.</p><button type="button" onClick={() => setAssuranceAttempt((attempt) => attempt + 1)} className="rounded border border-warning/40 px-3 py-1.5 text-xs font-semibold hover:bg-warning/10">Retry MFA check</button></> : factors.some((factor) => factor.status === 'verified') ? <>
        <p>Verify your authenticator to continue to this administrator page.</p>
        <div className="flex flex-wrap gap-2">
          <input aria-label="Administrator authenticator code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="w-36 rounded border border-border bg-bg px-2 py-1.5 text-xs text-text" placeholder="6-digit code" />
          <button type="button" disabled={challenging || code.length !== 6} onClick={() => { const factor = factors.find((item) => item.status === 'verified'); if (!factor) return; setChallenging(true); setChallengeError(''); void verifyMfaChallenge(factor.id, code).then(() => { setCode(''); setAssuranceAttempt((attempt) => attempt + 1); }).catch((error) => setChallengeError(error instanceof Error ? error.message : 'MFA verification failed.')).finally(() => setChallenging(false)); }} className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50">{challenging ? 'Verifying…' : 'Verify authenticator'}</button>
        </div>
        {challengeError && <p role="alert" className="text-xs">{challengeError}</p>}
      </> : <>
        <p>Administrator access requires a verified authenticator.</p>
        <button type="button" onClick={() => { window.history.pushState({}, '', '/settings'); window.dispatchEvent(new PopStateEvent('popstate')); }} className="rounded border border-warning/40 px-3 py-1.5 text-xs font-semibold hover:bg-warning/10">Open security settings</button>
      </>}
    </div> : <>
      <p>Administrator assurance could not be verified. Check your connection and retry.</p>
      <button type="button" onClick={() => setAssuranceAttempt((attempt) => attempt + 1)} className="mt-3 rounded border border-warning/40 px-3 py-1.5 font-semibold hover:bg-warning/10">Retry check</button>
    </>}
  </div>;
  return <>{children}</>;
}
