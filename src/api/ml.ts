import { supabase } from '../lib/supabase';
import type { MLPrediction, Timeframe } from '../lib/types';

export interface CoachMessage { role: 'user' | 'assistant'; content: string }

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

async function callEdgeFunction<T>(slug: string, body: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Authentication required.');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Edge function ${slug} failed (${res.status})`);
  return res.json() as Promise<T>;
}

export const mlApi = {
  async getCachedPrediction(symbol: string, timeframe: Timeframe): Promise<{ prediction: MLPrediction | null }> {
    const { data, error } = await supabase
      .from('ml_predictions')
      .select('symbol,timeframe,prediction,probability,expected_move_pct,model_version,confidence')
      .eq('symbol', symbol)
      .eq('timeframe', timeframe)
      .maybeSingle();
    if (error) throw error;
    return {
      prediction: data ? {
        pair: data.symbol,
        timeframe: data.timeframe as Timeframe,
        prediction: data.prediction as MLPrediction['prediction'],
        probability: Number(data.probability),
        expected_move_pct: Number(data.expected_move_pct),
        model_version: data.model_version,
        confidence: data.confidence as MLPrediction['confidence'],
      } : null,
    };
  },

  async predict(symbol: string, timeframe: Timeframe): Promise<{ prediction: MLPrediction | null }> {
    const result = await callEdgeFunction<MLPrediction>('ml-predict/predict', { pair: symbol, timeframe });
    return { prediction: result };
  },

  async getVersions(): Promise<{ versions: Array<{ model_version: string; created_at: string }> }> {
    const { data, error } = await supabase
      .from('ml_predictions')
      .select('model_version,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return { versions: data ?? [] };
  },
};

export const coachApi = {
  async ask(messages: CoachMessage[]): Promise<{ reply: string }> {
    return callEdgeFunction('kinetic-coach', { messages });
  },
};
