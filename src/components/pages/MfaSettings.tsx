import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { enrollTotp, listTotpFactors, removeTotp, verifyTotp, type TotpFactor } from '../../lib/account-security';

export default function MfaSettings({ isAdmin }: { isAdmin: boolean }) {
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [enrollment, setEnrollment] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [removingFactorId, setRemovingFactorId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    try { setFactors(await listTotpFactors()); setMessage(''); }
    catch { setMessage('Two-factor settings are unavailable.'); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const beginEnrollment = async () => {
    setBusy(true); setMessage('');
    try { setEnrollment(await enrollTotp()); setCode(''); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Could not start enrollment.'); }
    finally { setBusy(false); }
  };

  const verifyEnrollment = async () => {
    if (!enrollment || code.length !== 6) return;
    setBusy(true); setMessage('');
    try {
      await verifyTotp(enrollment.factorId, code);
      setEnrollment(null); setCode(''); setMessage('Authenticator enabled.'); await refresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'The code was not accepted.'); }
    finally { setBusy(false); }
  };

  const confirmRemoval = async () => {
    if (!removingFactorId || code.length !== 6) return;
    setBusy(true); setMessage('');
    try {
      await removeTotp(removingFactorId, code);
      setRemovingFactorId(null); setCode(''); setMessage('Authenticator removed.'); await refresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'The authenticator could not be removed.'); }
    finally { setBusy(false); }
  };

  const verified = factors.filter((factor) => factor.status === 'verified');
  return <section className="border-t border-border/60 pt-4 space-y-3">
    <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h2 className="text-sm font-medium">Two-factor authentication</h2></div>
    <p className="text-xs text-muted">Use a TOTP authenticator. Recovery is handled by the account owner through the Supabase dashboard; this app does not store backup codes.</p>
    {isAdmin && <p className="text-xs text-warning">Administrator accounts should enroll an authenticator. Server-side AAL2 enforcement is controlled by REQUIRE_ADMIN_MFA.</p>}
    {verified.length ? <div className="space-y-2">{verified.map((factor) => <div key={factor.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bg/60 p-3"><span className="text-xs">{factor.friendly_name || 'Authenticator app'} · Verified</span>{removingFactorId === factor.id ? <div className="flex gap-2"><input aria-label="Code to remove authenticator" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="w-28 rounded border border-border bg-surface px-2 py-1 text-xs" /><button type="button" disabled={busy || code.length !== 6} onClick={() => void confirmRemoval()} className="rounded border border-danger/40 px-2 py-1 text-xs text-danger disabled:opacity-50">Verify and remove</button><button type="button" onClick={() => { setRemovingFactorId(null); setCode(''); }} className="text-xs text-muted">Cancel</button></div> : <button type="button" disabled={busy} onClick={() => { setRemovingFactorId(factor.id); setCode(''); }} className="rounded border border-border px-2 py-1 text-xs">Remove</button>}</div>)}</div> : <p className="text-xs text-muted">No verified authenticator is enrolled.</p>}
    {enrollment ? <div className="rounded-lg border border-border bg-bg/60 p-3 space-y-3"><p className="text-xs font-medium">Scan the QR code, then verify a code before enabling.</p><img alt="TOTP enrollment QR code" src={`data:image/svg+xml;utf-8,${encodeURIComponent(enrollment.qrCode)}`} className="h-40 w-40 bg-white p-2" /><label className="block text-xs text-muted">Authenticator secret (shown once)<input readOnly value={enrollment.secret} className="mt-1 block w-full select-all rounded border border-border bg-surface px-2 py-1 font-mono text-xs" /></label><div className="flex gap-2"><input aria-label="Authenticator verification code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="w-32 rounded border border-border bg-surface px-2 py-1 text-xs" /><button type="button" disabled={busy || code.length !== 6} onClick={() => void verifyEnrollment()} className="rounded bg-primary px-3 py-1 text-xs font-semibold text-black disabled:opacity-50">{busy ? 'Verifying…' : 'Verify and enable'}</button><button type="button" disabled={busy} onClick={() => { setEnrollment(null); setCode(''); }} className="text-xs text-muted">Cancel</button></div></div> : verified.length === 0 && <button type="button" disabled={busy} onClick={() => void beginEnrollment()} className="rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-50">{busy ? 'Starting…' : 'Set up authenticator'}</button>}
    {message && <p role="status" className="text-xs text-muted">{message}</p>}
  </section>;
}
