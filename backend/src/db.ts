import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './config.js';

let serviceClient: SupabaseClient | null = null;
let anonClient: SupabaseClient | null = null;
const tokenClientCache = new Map<string, SupabaseClient>();

// Service-role client — bypasses RLS. Use only for trusted admin/system operations.
export function getSupabaseClient(): SupabaseClient {
  if (!serviceClient) {
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
      throw new Error('Supabase service role key not configured. Set SUPABASE_SERVICE_ROLE_KEY in .env');
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
  let client = tokenClientCache.get(accessToken);
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    tokenClientCache.set(accessToken, client);
    setTimeout(() => tokenClientCache.delete(accessToken), 5 * 60 * 1000);
  }
  return client;
}
