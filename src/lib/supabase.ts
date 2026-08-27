import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const missingVars: string[] = [];
if (!url) missingVars.push('VITE_SUPABASE_URL');
if (!anonKey) missingVars.push('VITE_SUPABASE_ANON_KEY');

if (missingVars.length > 0) {
  console.warn(
    `[supabase] Missing environment variables: ${missingVars.join(', ')}. ` +
    'Authentication and database features will be unavailable until these are set. ' +
    'Copy .env.example to .env and fill in your Supabase project credentials.'
  );
}

// Create a graceful client that works (limited) without env vars
const supabaseUrl = url ?? 'https://placeholder.supabase.co';
const supabaseKey = anonKey ?? 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
