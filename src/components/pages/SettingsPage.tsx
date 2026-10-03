import { useEffect, useState } from 'react';
import { Bell, Moon, Sun, UserRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { workspaceApi, type UserPreferences } from '../../api/workspace';

const DEFAULT_NOTIFICATIONS: UserPreferences['notifications'] = { marketAlerts: true, news: false };

export default function SettingsPage() {
  const { user, profile } = useAuth();
  const { theme, syncError, toggle } = useTheme();
  const [notifications, setNotifications] = useState(DEFAULT_NOTIFICATIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
