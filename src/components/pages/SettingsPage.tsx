import { useEffect, useState } from 'react';
import { Bell, Camera, Moon, Sun, UserRound, Download, MonitorX } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { workspaceApi, type UserPreferences } from '../../api/workspace';
import { supabase } from '../../lib/supabase';
import { resolveAvatarUrl } from '../../lib/avatar';
import { changePasswordWithReauthentication, signOutOtherSessions, validateAvatarFile } from '../../lib/account-security';
import { downloadPersonalDataExport } from '../../lib/backend-api';
import MfaSettings from './MfaSettings';

const DEFAULT_NOTIFICATIONS: UserPreferences['notifications'] = { marketAlerts: true, news: false };

export default function SettingsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { theme, syncError, toggle } = useTheme();
  const passwordLockKey = `password-change-lock-until:${user?.id ?? 'unknown'}`;
  const passwordFailuresKey = `password-change-failures:${user?.id ?? 'unknown'}`;
  const [notifications, setNotifications] = useState(DEFAULT_NOTIFICATIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordFailures, setPasswordFailures] = useState(() => Number(localStorage.getItem(passwordFailuresKey)) || 0);
  const [passwordLocked, setPasswordLocked] = useState(() => {
    const until = Number(localStorage.getItem(passwordLockKey));
    if (until > Date.now()) return true;
    localStorage.removeItem(passwordLockKey);
    return false;
  });
  const [accountBusy, setAccountBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [sessionsBusy, setSessionsBusy] = useState(false);
  const [accountMessage, setAccountMessage] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    workspaceApi.getPreferences()
      .then((preferences) => {
        if (!cancelled && preferences) setNotifications(preferences.notifications);
      })
      .catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Could not load your preferences.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => { setDisplayName(profile?.displayName ?? ''); }, [profile?.displayName]);
  useEffect(() => { setEmail(user?.email ?? ''); }, [user?.email]);
  useEffect(() => { let active = true; void resolveAvatarUrl(profile?.avatarUrl).then((url) => { if (active) setAvatarUrl(url); }); return () => { active = false; }; }, [profile?.avatarUrl]);

  const uploadAvatar = async (file?: File) => {
    if (!file || !user) return;
    setAccountBusy(true); setAccountMessage('');
    try {
      await validateAvatarFile(file);
      const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
      const path = `${user.id}/profile.${extension}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { error: profileError } = await supabase.from('profiles').update({ avatar_url: path }).eq('id', user.id);
      if (profileError) throw profileError;
      await refreshProfile(); setAccountMessage('Profile picture updated.');
    } catch (uploadError) { setAccountMessage(uploadError instanceof Error ? uploadError.message : 'Could not upload the profile picture.'); }
    finally { setAccountBusy(false); }
  };

  const saveDisplayName = async () => {
    if (!user) return;
    setAccountBusy(true); setAccountMessage('');
    try {
      const { error: updateError } = await supabase.from('profiles').update({ display_name: displayName.trim() || null }).eq('id', user.id);
      if (updateError) throw updateError;
      await refreshProfile(); setAccountMessage('Display name saved.');
    } catch { setAccountMessage('Could not update your display name.'); }
    finally { setAccountBusy(false); }
  };

  const updateEmail = async () => {
    if (!user) return;
    setAccountBusy(true); setAccountMessage('');
    try {
      const { error: updateError } = await supabase.auth.updateUser({ email: email.trim() });
      if (updateError) throw updateError;
      setAccountMessage('Email change pending confirmation. Check the confirmation email; notification to the old address depends on the Supabase Auth email-change setting.');
      const { error: auditError } = await supabase.rpc('record_own_account_event', { p_action: 'email_change_requested' });
      if (auditError) setAccountMessage('Email change is pending confirmation, but the audit record could not be saved.');
    } catch { setAccountMessage('Email change could not be completed. Check your account and try again.'); }
    finally { setAccountBusy(false); }
  };

  const passwordStrong = newPassword.length >= 12 && /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) && /[0-9]/.test(newPassword);
  const updatePassword = async () => {
    if (!user?.email || passwordLocked || passwordFailures >= 5 || !passwordStrong || newPassword !== confirmPassword) return;
    setAccountBusy(true); setAccountMessage('');
    try {
      await changePasswordWithReauthentication(user.email, currentPassword, newPassword);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPasswordFailures(0); setPasswordLocked(false);
      localStorage.removeItem(passwordLockKey); localStorage.removeItem(passwordFailuresKey);
      setAccountMessage('Password updated.');
    } catch {
      const nextFailures = passwordFailures + 1;
      setPasswordFailures(nextFailures);
      localStorage.setItem(passwordFailuresKey, String(nextFailures));
      if (nextFailures >= 5) {
        localStorage.setItem(passwordLockKey, String(Date.now() + 15 * 60_000));
        setPasswordLocked(true);
        setAccountMessage('Too many failed attempts. Password changes are locked for 15 minutes.');
        window.setTimeout(() => {
          localStorage.removeItem(passwordLockKey); localStorage.removeItem(passwordFailuresKey);
          setPasswordFailures(0);
          setPasswordLocked(false);
        }, 15 * 60_000);
      } else setAccountMessage('Password could not be updated. Check your current password and requirements.');
    } finally { setAccountBusy(false); }
  };

  const exportData = async () => {
    setExportBusy(true); setAccountMessage('');
    try {
      const blob = await downloadPersonalDataExport();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'personal-data-export.json'; link.click();
      URL.revokeObjectURL(url);
      setAccountMessage('Your personal data export was downloaded.');
    } catch { setAccountMessage('Personal data export is unavailable. Please retry later.'); }
    finally { setExportBusy(false); }
  };

  const signOutOthers = async () => {
    setSessionsBusy(true); setAccountMessage('');
    try { await signOutOtherSessions(); setAccountMessage('Other devices have been signed out.'); }
    catch { setAccountMessage('Could not sign out other devices.'); }
    finally { setSessionsBusy(false); }
  };

  const updateNotifications = async (next: UserPreferences['notifications']) => {
    const previous = notifications;
    setNotifications(next);
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await workspaceApi.savePreferences({ notifications: next });
      setSaved(true);
    } catch (saveError) {
      setNotifications(previous);
      setError(saveError instanceof Error ? saveError.message : 'Could not save notification preferences.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-frame space-y-6 max-w-2xl">
      <div className="page-heading"><div className="page-heading-copy"><div className="page-eyebrow"><UserRound className="w-3.5 h-3.5" /> Personal workspace</div><h1>Settings</h1><p>Manage your account appearance and notification preferences.</p></div></div>

      <section className="bg-surface border border-border rounded-xl p-5 space-y-5">
        <div className="flex flex-wrap items-center gap-4 border-b border-border/60 pb-5">
          {avatarUrl ? <img src={avatarUrl} alt="Profile" className="h-16 w-16 rounded-full object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">{(profile?.displayName || user?.email || 'U').slice(0, 1).toUpperCase()}</div>}
          <div className="min-w-0 flex-1"><h2 className="text-sm font-medium">Profile picture</h2><p className="mt-1 text-xs text-muted">Private image storage. JPEG, PNG, or WebP up to 2 MB.</p></div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:border-primary/40"><Camera className="h-4 w-4" />{accountBusy ? 'Saving…' : 'Upload picture'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={accountBusy} className="sr-only" onChange={(event) => { void uploadAvatar(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>
        </div>

        <div className="grid gap-3 border-b border-border/60 pb-5 sm:grid-cols-[1fr_auto]"><label className="text-xs font-medium">Display name<input value={displayName} maxLength={80} onChange={(event) => setDisplayName(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text" /></label><button type="button" disabled={accountBusy} onClick={() => void saveDisplayName()} className="self-end rounded-lg border border-border px-3 py-2 text-xs font-medium disabled:opacity-50">Save name</button></div>

        <div className="grid gap-3 border-b border-border/60 pb-5 sm:grid-cols-[1fr_auto]"><label className="text-xs font-medium">Change email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text" /></label><button type="button" disabled={accountBusy || !email.trim() || email === user?.email} onClick={() => void updateEmail()} className="self-end rounded-lg border border-border px-3 py-2 text-xs font-medium disabled:opacity-50">Update email</button></div>

        <div className="grid gap-3 border-b border-border/60 pb-5 sm:grid-cols-[1fr_auto]"><div className="space-y-2"><label className="block text-xs font-medium">Current password<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text" /></label><label className="block text-xs font-medium">New password<input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="12+ chars, upper/lowercase and a number" className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text" /></label><label className="block text-xs font-medium">Confirm new password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text" /></label><p className="text-[10px] text-muted">Your current password is re-verified with Supabase before changing it.</p></div><button type="button" disabled={accountBusy || passwordLocked || passwordFailures >= 5 || !currentPassword || !passwordStrong || newPassword !== confirmPassword} onClick={() => void updatePassword()} className="self-end rounded-lg border border-border px-3 py-2 text-xs font-medium disabled:opacity-50">Update password</button></div>
        {accountMessage && <p role="status" className="text-xs text-muted">{accountMessage}</p>}

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">{theme === 'dark' ? <Moon className="w-4 h-4 text-primary" /> : <Sun className="w-4 h-4 text-primary" />}</div><div><h2 className="text-sm font-medium">Appearance</h2><p className="text-xs text-muted mt-0.5">Your theme preference syncs with your account.</p></div></div>
          <button type="button" onClick={toggle} className="px-3.5 py-1.5 rounded-lg bg-bg border border-border text-xs font-medium hover:border-primary/30 transition-colors">Switch to {theme === 'dark' ? 'light' : 'dark'} mode</button>
        </div>

        <div className="border-t border-border/60 pt-4 space-y-3">
          <div><div className="text-sm font-medium mb-1">Account</div><div className="text-xs text-muted">{user?.email}</div><div className="text-xs text-muted mt-1">Role: {profile?.role ?? 'user'}</div><div className="text-xs text-muted mt-1">Last sign-in: {user?.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : 'Unavailable'}</div></div>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={sessionsBusy} onClick={() => void signOutOthers()} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-50"><MonitorX className="h-3.5 w-3.5" />{sessionsBusy ? 'Signing out…' : 'Sign out of other devices'}</button><button type="button" disabled={exportBusy} onClick={() => void exportData()} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-50"><Download className="h-3.5 w-3.5" />{exportBusy ? 'Preparing…' : 'Export my data'}</button></div>
        </div>
        <MfaSettings isAdmin={profile?.role === 'admin'} />

        <div className="border-t border-border/60 pt-4">
          <div className="flex items-center gap-2 mb-3"><Bell className="w-4 h-4 text-primary" /><h2 className="text-sm font-medium">Notifications</h2></div>
          {loading ? <div className="text-xs text-muted">Loading preferences…</div> : <div className="space-y-3">
            <PreferenceToggle label="Price alert updates" description="Show when a monitored price level is reached." checked={notifications.marketAlerts} disabled={saving} onChange={(checked) => updateNotifications({ ...notifications, marketAlerts: checked })} />
            <PreferenceToggle label="News updates" description="Receive updates when new research is published." checked={notifications.news} disabled={saving} onChange={(checked) => updateNotifications({ ...notifications, news: checked })} />
          </div>}
          {syncError && <p role="alert" className="text-xs text-danger mt-3">{syncError}</p>}
          {error && <p role="alert" className="text-xs text-danger mt-3">{error}</p>}
          {saved && !saving && <p role="status" className="text-xs text-success mt-3">Preferences saved.</p>}
        </div>
      </section>
    </div>
  );
}

function PreferenceToggle({ label, description, checked, disabled, onChange }: { label: string; description: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center justify-between gap-4 cursor-pointer"><span><span className="block text-xs font-medium">{label}</span><span className="block text-[10px] text-muted mt-0.5">{description}</span></span><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-border accent-primary disabled:opacity-50" /></label>;
}
