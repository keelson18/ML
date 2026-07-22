import type { MLPrediction, Timeframe } from './types';
import { supabase } from './supabase';

const ML_KEY = 'qi-ml-default-key';

// Call the ML prediction edge function. Falls back gracefully on error.
export async function fetchMLPrediction(symbol: string, timeframe: Timeframe): Promise<MLPrediction | null> {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ml-predict/predict`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'x-api-key': ML_KEY,
      },
      body: JSON.stringify({ pair: symbol, timeframe }),
    });
    if (!res.ok) {
      console.warn('ML predict failed', res.status);
      return null;
    }
    const data = await res.json();
    if (!data || data.error) return null;
    return {
      pair: data.pair,
      timeframe: data.timeframe,
      prediction: data.prediction,
      probability: data.probability,
      expected_move_pct: data.expected_move_pct,
      model_version: data.model_version,
      confidence: data.confidence,
    };
  } catch (e) {
    console.warn('ML predict error', e);
    return null;
  }
}

// Fetch the most recent cached ML prediction from the database (for instant UI load).
export async function fetchCachedMLPrediction(symbol: string, timeframe: Timeframe): Promise<MLPrediction | null> {
  const { data } = await supabase
    .from('ml_predictions')
    .select('*')
    .eq('symbol', symbol)
    .eq('timeframe', timeframe)
    .maybeSingle();
  if (!data) return null;
  return {
    pair: data.symbol,
    timeframe: data.timeframe,
    prediction: data.prediction,
    probability: Number(data.probability),
    expected_move_pct: Number(data.expected_move_pct),
    model_version: data.model_version,
    confidence: data.confidence,
  };
}

export interface CoachMessage { role: 'user' | 'assistant'; content: string }

export async function askCoach(messages: CoachMessage[]): Promise<string> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kinetic-coach`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error(`Coach failed (${res.status})`);
  const data = await res.json();
  return data.reply ?? data.error ?? 'No response.';
}
