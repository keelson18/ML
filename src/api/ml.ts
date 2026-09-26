import { api } from './client';
import type { MLPrediction, Timeframe } from '../lib/types';

export interface CoachMessage { role: 'user' | 'assistant'; content: string }

export const mlApi = {
  getCachedPrediction: (symbol: string, timeframe: Timeframe) =>
    api.get<{ prediction: MLPrediction | null }>(
      `/ml/prediction?symbol=${symbol}&timeframe=${timeframe}`,
    ),

  predict: (symbol: string, timeframe: Timeframe) =>
    api.post<{ prediction: MLPrediction | null }>('/ml/predict', { symbol, timeframe }),

  getVersions: () =>
    api.get<{ versions: Array<{ model_version: string; created_at: string }> }>('/ml/versions'),
};

export const coachApi = {
  ask: (messages: CoachMessage[]) =>
    api.post<{ reply: string }>('/coach/ask', { messages }),
};
