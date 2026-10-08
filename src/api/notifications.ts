import { supabase } from '../lib/supabase';

export interface InAppNotification {
  id: string;
  notification_type: string;
  title: string;
  body: string;
  href: string;
  created_at: string;
  read_at: string | null;
}

export async function fetchNotifications(userId: string): Promise<InAppNotification[]> {
  const { data, error } = await supabase.from('in_app_notifications')
    .select('id,notification_type,title,body,href,created_at,read_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(25);
  if (error) throw error;
  return data ?? [];
}

export async function markNotificationRead(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('in_app_notifications').update({ read_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', userId).is('read_at', null);
  if (error) throw error;
}
