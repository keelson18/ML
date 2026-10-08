import { supabase } from '../lib/supabase';
import { readJsonSafe } from '../../shared/http';

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

  const res = await fetch(path, { ...options, headers });

  const { payload } = await readJsonSafe<T & { error?: string }>(res);
  if (!res.ok) throw new Error(payload?.error ?? `Request failed (${res.status})`);
  if (payload === null) throw new Error('The server returned an empty or invalid response.');
  return payload;
}

export const api = {
  get: <T = unknown>(path: string) => apiRequest<T>(path, { method: 'GET' }),
  post: <T = unknown>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T = unknown>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  del: <T = unknown>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};
