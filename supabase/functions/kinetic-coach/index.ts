// Kinetic Coach edge function. Proxies Gemini for an authenticated user's coaching chat.
// The Gemini key is sent in a request header and never logged or returned.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { createCoachHandler } from "./coach.ts";

const COACH_REQUESTS_PER_MINUTE = 10;
const DEFAULT_DAILY_TOKEN_CAP = 20000;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const dailyTokenCap = Number(Deno.env.get("COACH_DAILY_TOKEN_CAP")) || DEFAULT_DAILY_TOKEN_CAP;
const backendUrl = Deno.env.get("BACKEND_URL") || undefined;
const RECORDS_TIMEOUT_MS = 5000;

let service: SupabaseClient | null = null;
function serviceClient(): SupabaseClient {
  service ??= createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  return service;
}

Deno.serve(createCoachHandler({
  corsOrigin: Deno.env.get("CORS_ORIGIN") || undefined,
  geminiKey: Deno.env.get("GEMINI_API_KEY") || undefined,
  geminiModel: Deno.env.get("GEMINI_MODEL") || undefined,
  authenticate: async (req) => {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return null;
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return { userId: user.id, accessToken: authorization.slice("Bearer ".length) };
  },
  consumeRequestSlot: async (userId) => {
    const { data, error } = await serviceClient().rpc("consume_ml_rate_limit", {
      p_key: `coach:${userId}`,
      p_max_requests: COACH_REQUESTS_PER_MINUTE,
    });
    if (error) throw new Error(`rate limit check failed: ${error.code}`);
    return data === true;
  },
  consumeTokens: async (userId, tokens) => {
    const { data, error } = await serviceClient().rpc("consume_coach_budget", {
      p_user_id: userId,
      p_tokens: tokens,
      p_daily_cap: dailyTokenCap,
    });
    if (error) throw new Error(`budget check failed: ${error.code}`);
    return data === true;
  },
  fetchRecords: async (accessToken) => {
    if (!backendUrl) return null;
    try {
      const res = await fetch(`${backendUrl}/api/v1/coach/context`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(RECORDS_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },
  fetchImpl: fetch,
}));
