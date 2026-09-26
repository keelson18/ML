import type { MLPrediction, Timeframe } from './types';
import { mlApi, coachApi, type CoachMessage } from '../api';

// Fetch a fresh ML prediction from the backend.
export async function fetchMLPrediction(symbol: string, timeframe: Timeframe): Promise<MLPrediction | null> {
  try {
    const { prediction } = await mlApi.predict(symbol, timeframe);
    return prediction;
  } catch (e) {
    console.warn('ML predict error', e);
    return null;
  }
}

// Fetch the most recent cached ML prediction (for instant UI load).
export async function fetchCachedMLPrediction(symbol: string, timeframe: Timeframe): Promise<MLPrediction | null> {
  try {
    const { prediction } = await mlApi.getCachedPrediction(symbol, timeframe);
    return prediction;
  } catch {
    return null;
  }
}

export type { CoachMessage };

export async function askCoach(messages: CoachMessage[]): Promise<string> {
  const { reply } = await coachApi.ask(messages);
  return reply;
}
