import { supabase } from './supabase';

export async function resolveAvatarUrl(path?: string): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from('avatars').createSignedUrl(path, 60 * 60);
  return error ? null : data.signedUrl;
}
