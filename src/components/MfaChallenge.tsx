import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function MfaChallenge() {
  const { verifyMfaChallenge, cancelMfaChallenge } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const result = await verifyMfaChallenge(code.replace(/\s/g, ''));
    if (result.error) setError(result.error);
    setBusy(false);
  };

  return <main className="min-h-screen bg-bg px-4 text-text flex items-center justify-center">
    <form onSubmit={(event) => void submit(event)} className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-surface p-6">
      <div><h1 className="text-lg font-semibold">Two-factor verification</h1><p className="mt-1 text-xs text-muted">Enter the current code from your authenticator app to continue.</p></div>
      <label className="block text-xs font-medium">Authentication code<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm tracking-[0.3em]" /></label>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <button type="submit" disabled={busy || code.length !== 6} className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-black disabled:opacity-50">{busy ? 'Verifying…' : 'Verify and continue'}</button>
      <button type="button" disabled={busy} onClick={() => void cancelMfaChallenge()} className="w-full rounded-lg border border-border px-3 py-2 text-xs text-muted">Cancel and sign out</button>
    </form>
  </main>;
}
