import { authRepository, cmsRepository, mlRepository, tradingRepository, metricsRepository } from '../repositories/index.js';
import type { UserProfile, CMSContent, MLPrediction, Position, Trade, SystemMetric, CoachMessage } from '../models/types.js';
import { config } from '../config.js';

export const authService = {
  async signIn(email: string, password: string) {
    const session = await authRepository.signIn(email, password);
    if (!session.user) throw new Error('Sign in failed');
    const profile = await authRepository.getProfile(session.session.access_token, session.user.id);
    return {
      session: session.session,
      user: { id: session.user.id, email: session.user.email ?? '' },
      profile,
    };
  },

  async signUp(email: string, password: string, metadata: Record<string, unknown>) {
    return authRepository.signUp(email, password, metadata);
  },

  async getProfile(accessToken: string, userId: string): Promise<UserProfile | null> {
    return authRepository.getProfile(accessToken, userId);
  },

  async getAllProfiles(accessToken: string): Promise<UserProfile[]> {
    return authRepository.getAllProfiles(accessToken);
  },

  async updateProfileRole(accessToken: string, userId: string, role: string): Promise<void> {
    return authRepository.updateProfileRole(accessToken, userId, role);
  },
};

export const cmsService = {
  async fetchPublished(contentType?: string): Promise<CMSContent[]> {
    return cmsRepository.fetchPublished(contentType);
  },

  async fetchBySlug(slug: string, allowUnpublished: boolean): Promise<CMSContent | null> {
    return cmsRepository.fetchBySlug(slug, allowUnpublished);
  },

  async fetchAll(accessToken: string): Promise<CMSContent[]> {
    return cmsRepository.fetchAll(accessToken);
  },

  async upsert(accessToken: string, userId: string, payload: Record<string, unknown>): Promise<CMSContent | null> {
    const record: Record<string, unknown> = { ...payload, author_id: userId };
    if (payload.published) {
      record.published_at = new Date().toISOString();
    }
    return cmsRepository.upsert(accessToken, record);
  },

  async delete(accessToken: string, id: string): Promise<void> {
    return cmsRepository.delete(accessToken, id);
  },

  async togglePublish(accessToken: string, id: string, published: boolean): Promise<void> {
    return cmsRepository.togglePublish(accessToken, id, published);
  },
};

export const mlService = {
  async fetchCachedPrediction(symbol: string, timeframe: string): Promise<MLPrediction | null> {
    return mlRepository.fetchCachedPrediction(symbol, timeframe);
  },

  async fetchModelVersions(accessToken: string) {
    return mlRepository.fetchModelVersions(accessToken);
  },

  async predict(symbol: string, timeframe: string): Promise<MLPrediction | null> {
    return mlRepository.fetchCachedPrediction(symbol, timeframe);
  },
};

export const tradingService = {
  async fetchPositions(accessToken: string, userId: string): Promise<Position[]> {
    return tradingRepository.fetchPositions(accessToken, userId);
  },

  async createPosition(accessToken: string, payload: Record<string, unknown>): Promise<Position | null> {
    return tradingRepository.createPosition(accessToken, payload);
  },

  async closePosition(accessToken: string, id: string): Promise<void> {
    return tradingRepository.closePosition(accessToken, id, new Date().toISOString());
  },

  async fetchTrades(accessToken: string, userId: string): Promise<Trade[]> {
    return tradingRepository.fetchTrades(accessToken, userId);
  },
};

export const metricsService = {
  async fetchMetrics(accessToken: string): Promise<SystemMetric[]> {
    return metricsRepository.fetchMetrics(accessToken);
  },
};

export const coachService = {
  async ask(messages: CoachMessage[]): Promise<string> {
    if (!config.geminiApiKey) {
      return 'Kinetic Coach is not configured. Please set GEMINI_API_KEY in the server environment to enable AI coaching.';
    }
    const GEMINI_MODEL = 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${config.geminiApiKey}`;
    const SYSTEM_PROMPT = `You are Kinetic Coach, an AI trading coach. Be concise, practical, and educational. Never give guaranteed-profit advice.`;
    const contents = [
      { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
      { role: 'model', parts: [{ text: 'Understood. I am Kinetic Coach.' }] },
      ...messages.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
    ];
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: { temperature: 0.7, maxOutputTokens: 1024 } }),
    });
    if (!res.ok) throw new Error('Gemini request failed');
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response generated.';
  },
};

export const marketService = {
  async fetchKlines(symbol: string, interval: string, limit: number = 1000) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Binance klines ${res.status}`);
    const raw = (await res.json()) as unknown[][];
    return raw.map((k) => ({
      time: Math.floor((k[0] as number) / 1000),
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
    }));
  },
};
