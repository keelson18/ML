import { supabase } from '../lib/supabase';
import type { MLPrediction, Timeframe } from '../lib/types';

export interface CoachMessage { role: 'user' | 'assistant'; content: string }

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

async function callEdgeFunction<T>(slug: string, body: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.access_token ?? ''}`,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Edge function ${slug} failed (${res.status})`);
  return res.json() as Promise<T>;
}

export const mlApi = {
  async getCachedPrediction(symbol: string, timeframe: Timeframe): Promise<{ prediction: MLPrediction | null }> {
    try {
      return await callEdgeFunction('ml-predict', { symbol, timeframe, cached: true });
    } catch {
      return { prediction: null };
    }
  },

  async predict(symbol: string, timeframe: Timeframe): Promise<{ prediction: MLPrediction | null }> {
    try {
      return await callEdgeFunction('ml-predict', { symbol, timeframe });
    } catch {
      return { prediction: null };
    }
  },

  async getVersions(): Promise<{ versions: Array<{ model_version: string; created_at: string }> }> {
    try {
      return await callEdgeFunction('ml-predict', { action: 'versions' });
    } catch {
      return { versions: [] };
    }
  },
};

export const coachApi = {
  async ask(messages: CoachMessage[]): Promise<{ reply: string }> {
    return callEdgeFunction('kinetic-coach', { messages });
  },
};
