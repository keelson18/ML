import { useEffect, useState } from 'react';
import { Bell, Camera, Moon, Sun, UserRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { workspaceApi, type UserPreferences } from '../../api/workspace';
import { supabase } from '../../lib/supabase';
import { resolveAvatarUrl } from '../../lib/avatar';

const DEFAULT_NOTIFICATIONS: UserPreferences['notifications'] = { marketAlerts: true, news: false };

export default function SettingsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { theme, syncError, toggle } = useTheme();
  const [notifications, setNotifications] = useState(DEFAULT_NOTIFICATIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);
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
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Choose a JPEG, PNG, or WebP image smaller than 5 MB.');
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
    const { error: updateError } = await supabase.from('profiles').update({ display_name: displayName.trim() || null }).eq('id', user.id);
    if (updateError) setAccountMessage('Could not update your display name.');
    else { await refreshProfile(); setAccountMessage('Display name saved.'); }
    setAccountBusy(false);
  };

  const updateEmail = async () => {
    setAccountBusy(true); setAccountMessage('');
    const { error: updateError } = await supabase.auth.updateUser({ email: email.trim() });
    setAccountMessage(updateError ? updateError.message : 'Check your inbox to confirm the email change.');
    setAccountBusy(false);
  };

  const updatePassword = async () => {
    setAccountBusy(true); setAccountMessage('');
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setAccountMessage(updateError ? updateError.message : 'Password updated.');
    if (!updateError) setNewPassword('');
    setAccountBusy(false);
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
          <div className="min-w-0 flex-1"><h2 className="text-sm font-medium">Profile picture</h2><p className="mt-1 text-xs text-muted">Private image storage. JPEG, PNG, or WebP up to 5 MB.</p></div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:border-primary/40"><Camera className="h-4 w-4" />{accountBusy ? 'Saving…' : 'Upload picture'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={accountBusy} className="sr-only" onChange={(event) => { void uploadAvatar(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>
        </div>

        <div className="grid gap-3 border-b border-border/60 pb-5 sm:grid-cols-[1fr_auto]"><label className="text-xs font-medium">Display name<input value={displayName} maxLength={80} onChange={(event) => setDisplayName(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text" /></label><button type="button" disabled={accountBusy} onClick={() => void saveDisplayName()} className="self-end rounded-lg border border-border px-3 py-2 text-xs font-medium disabled:opacity-50">Save name</button></div>

        <div className="grid gap-3 border-b border-border/60 pb-5 sm:grid-cols-[1fr_auto]"><label className="text-xs font-medium">Change email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text" /></label><button type="button" disabled={accountBusy || !email.trim() || email === user?.email} onClick={() => void updateEmail()} className="self-end rounded-lg border border-border px-3 py-2 text-xs font-medium disabled:opacity-50">Update email</button></div>

        <div className="grid gap-3 border-b border-border/60 pb-5 sm:grid-cols-[1fr_auto]"><label className="text-xs font-medium">New password<input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 12 characters" className="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text" /></label><button type="button" disabled={accountBusy || newPassword.length < 12} onClick={() => void updatePassword()} className="self-end rounded-lg border border-border px-3 py-2 text-xs font-medium disabled:opacity-50">Update password</button></div>
        {accountMessage && <p role="status" className="text-xs text-muted">{accountMessage}</p>}

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">{theme === 'dark' ? <Moon className="w-4 h-4 text-primary" /> : <Sun className="w-4 h-4 text-primary" />}</div><div><h2 className="text-sm font-medium">Appearance</h2><p className="text-xs text-muted mt-0.5">Your theme preference syncs with your account.</p></div></div>
          <button type="button" onClick={toggle} className="px-3.5 py-1.5 rounded-lg bg-bg border border-border text-xs font-medium hover:border-primary/30 transition-colors">Switch to {theme === 'dark' ? 'light' : 'dark'} mode</button>
        </div>

        <div className="border-t border-border/60 pt-4">
          <div className="text-sm font-medium mb-1">Account</div>
          <div className="text-xs text-muted">{user?.email}</div>
          <div className="text-xs text-muted mt-1">Role: {profile?.role ?? 'user'}</div>
        </div>

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
