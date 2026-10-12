import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { isSupabaseServerKey } from './utils/supabase-server-key.js';

let serviceClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;

// Service-role client — bypasses RLS. Use only for trusted admin/system operations.
export function getSupabaseClient(): SupabaseClient {
  if (!serviceClient) {
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
      throw new Error('Supabase server key not configured. Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY in .env');
    }
    if (!isSupabaseServerKey(config.supabaseServiceRoleKey)) {
      throw new Error('Supabase server key must be an sb_secret_ key or a service_role JWT.');
    }
    serviceClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serviceClient;
}

// Anon-key client — respects RLS. Use for public reads and auth sign-in/sign-up.
export function getSupabaseAnonClient(): SupabaseClient {
  if (!anonClient) {
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error('Supabase anon key not configured. Set VITE_SUPABASE_ANON_KEY in .env');
    }
    anonClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return anonClient;
}

// User-scoped client — uses the user's access token so RLS sees their identity.
export function getSupabaseClientWithToken(accessToken: string): SupabaseClient {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Supabase user-scoped access requires SUPABASE_URL and SUPABASE_ANON_KEY.');
  }
  // Keep bearer tokens request-scoped instead of retaining them in a process-wide cache.
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
