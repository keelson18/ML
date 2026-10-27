import { supabase } from '../lib/supabase';

export interface UserPreferences {
  theme: 'light' | 'dark';
  notifications: { marketAlerts: boolean; news: boolean };
}

export interface PriceAlert {
  id: string;
  symbol: string;
  direction: 'above' | 'below';
  targetPrice: number;
  active: boolean;
  triggeredAt: string | null;
  createdAt: string;
}

const DEFAULT_NOTIFICATIONS: UserPreferences['notifications'] = { marketAlerts: true, news: false };

function mapAlert(row: Record<string, unknown>): PriceAlert {
  return {
    id: row.id as string,
    symbol: row.symbol as string,
    direction: row.direction as PriceAlert['direction'],
    targetPrice: Number(row.target_price),
    active: row.active as boolean,
    triggeredAt: (row.triggered_at as string) ?? null,
    createdAt: row.created_at as string,
  };
}

export const workspaceApi = {
  async getPreferences(): Promise<UserPreferences | null> {
    const { data, error } = await supabase.from('user_preferences').select('theme,notifications').maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const notifications = data.notifications as Partial<UserPreferences['notifications']> | null;
    return {
      theme: data.theme as UserPreferences['theme'],
      notifications: { marketAlerts: notifications?.marketAlerts ?? true, news: notifications?.news ?? false },
    };
  },

  async savePreferences(preferences: Partial<UserPreferences>): Promise<void> {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user) throw new Error('Authentication required.');
    const current = await workspaceApi.getPreferences();
    const { error } = await supabase.from('user_preferences').upsert({
      user_id: user.id,
      theme: preferences.theme ?? current?.theme ?? 'dark',
      notifications: preferences.notifications ?? current?.notifications ?? DEFAULT_NOTIFICATIONS,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw error;
  },

  async getWatchlist(userId: string): Promise<string[]> {
    const { data, error } = await supabase.from('user_watchlists').select('symbols').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data?.symbols ?? [];
  },

  async saveWatchlist(userId: string, symbols: string[]): Promise<void> {
    const { error } = await supabase.from('user_watchlists').upsert({
      user_id: userId,
      symbols,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw error;
  },

  async getAlerts(): Promise<PriceAlert[]> {
    const { data, error } = await supabase.from('price_alerts').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapAlert);
  },

  async createAlert(input: Pick<PriceAlert, 'symbol' | 'direction' | 'targetPrice'>): Promise<PriceAlert> {
    const { data, error } = await supabase.from('price_alerts').insert({
      symbol: input.symbol,
      direction: input.direction,
      target_price: input.targetPrice,
    }).select('*').single();
    if (error) throw error;
    return mapAlert(data);
  },

  async deleteAlert(id: string): Promise<void> {
    const { error } = await supabase.from('price_alerts').delete().eq('id', id);
    if (error) throw error;
  },

  async markAlertTriggered(id: string): Promise<void> {
    const { error } = await supabase.from('price_alerts').update({ active: false, triggered_at: new Date().toISOString() }).eq('id', id).eq('active', true);
    if (error) throw error;
  },
};
