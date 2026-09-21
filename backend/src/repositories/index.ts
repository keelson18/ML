import { getSupabaseClient, getSupabaseClientWithToken } from '../db.js';
import type { UserProfile, CMSContent, MLPrediction, Position, Trade, SystemMetric } from '../models/types.js';

export const authRepository = {
  async signIn(email: string, password: string) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return data;
  },

  async signUp(email: string, password: string, metadata: Record<string, unknown>) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: metadata } });
    if (error) throw new Error(error.message);
    return data;
  },

  async getSession(accessToken: string) {
    const supabase = getSupabaseClientWithToken(accessToken);
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user;
  },

  async getProfile(accessToken: string, userId: string): Promise<UserProfile | null> {
    const supabase = getSupabaseClientWithToken(accessToken);
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    return data as UserProfile | null;
  },

  async getAllProfiles(accessToken: string): Promise<UserProfile[]> {
    const supabase = getSupabaseClientWithToken(accessToken);
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    return (data ?? []) as UserProfile[];
  },

  async updateProfileRole(accessToken: string, userId: string, role: string): Promise<void> {
    const supabase = getSupabaseClientWithToken(accessToken);
    await supabase.from('profiles').update({ role }).eq('id', userId);
  },
};

export const cmsRepository = {
  async fetchPublished(contentType?: string): Promise<CMSContent[]> {
    const supabase = getSupabaseClient();
    let query = supabase.from('cms_content').select('*').eq('published', true).order('published_at', { ascending: false });
    if (contentType) query = query.eq('content_type', contentType);
    const { data } = await query;
    return (data ?? []) as CMSContent[];
  },

  async fetchBySlug(slug: string, allowUnpublished: boolean): Promise<CMSContent | null> {
    const supabase = getSupabaseClient();
    let query = supabase.from('cms_content').select('*').eq('slug', slug);
    if (!allowUnpublished) query = query.eq('published', true);
    const { data } = await query.maybeSingle();
    return data as CMSContent | null;
  },

  async fetchAll(accessToken: string): Promise<CMSContent[]> {
    const supabase = getSupabaseClientWithToken(accessToken);
    const { data } = await supabase.from('cms_content').select('*').order('created_at', { ascending: false });
    return (data ?? []) as CMSContent[];
  },

  async upsert(accessToken: string, payload: Record<string, unknown>): Promise<CMSContent | null> {
    const supabase = getSupabaseClientWithToken(accessToken);
    const { data } = await supabase.from('cms_content').upsert(payload, { onConflict: 'slug' }).select().single();
    return data as CMSContent | null;
  },

  async delete(accessToken: string, id: string): Promise<void> {
    const supabase = getSupabaseClientWithToken(accessToken);
    await supabase.from('cms_content').delete().eq('id', id);
  },

  async togglePublish(accessToken: string, id: string, published: boolean): Promise<void> {
    const supabase = getSupabaseClientWithToken(accessToken);
    await supabase.from('cms_content').update({ published: !published, published_at: !published ? new Date().toISOString() : null }).eq('id', id);
  },
};

export const mlRepository = {
  async fetchCachedPrediction(symbol: string, timeframe: string): Promise<MLPrediction | null> {
    const supabase = getSupabaseClient();
    const { data } = await supabase.from('ml_predictions').select('*').eq('symbol', symbol).eq('timeframe', timeframe).maybeSingle();
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
  },

  async fetchModelVersions(accessToken: string): Promise<Array<{ model_version: string; created_at: string }>> {
    const supabase = getSupabaseClientWithToken(accessToken);
    const { data } = await supabase.from('ml_predictions').select('model_version, created_at').order('created_at', { ascending: false }).limit(20);
    return data ?? [];
  },
};

export const tradingRepository = {
  async fetchPositions(accessToken: string, userId: string): Promise<Position[]> {
    const supabase = getSupabaseClientWithToken(accessToken);
    const { data } = await supabase.from('positions').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    return (data ?? []) as Position[];
  },

  async createPosition(accessToken: string, payload: Record<string, unknown>): Promise<Position | null> {
    const supabase = getSupabaseClientWithToken(accessToken);
    const { data } = await supabase.from('positions').insert(payload).select().single();
    return data as Position | null;
  },

  async closePosition(accessToken: string, id: string, closedAt: string): Promise<void> {
    const supabase = getSupabaseClientWithToken(accessToken);
    await supabase.from('positions').update({ status: 'closed', closed_at: closedAt }).eq('id', id);
  },

  async fetchTrades(accessToken: string, userId: string): Promise<Trade[]> {
    const supabase = getSupabaseClientWithToken(accessToken);
    const { data } = await supabase.from('trades').select('*').eq('user_id', userId).order('executed_at', { ascending: false });
    return (data ?? []) as Trade[];
  },

  async createTrade(accessToken: string, payload: Record<string, unknown>): Promise<Trade | null> {
    const supabase = getSupabaseClientWithToken(accessToken);
    const { data } = await supabase.from('trades').insert(payload).select().single();
    return data as Trade | null;
  },
};

export const metricsRepository = {
  async fetchMetrics(accessToken: string): Promise<SystemMetric[]> {
    const supabase = getSupabaseClientWithToken(accessToken);
    const { data } = await supabase.from('system_metrics').select('*').order('recorded_at', { ascending: false }).limit(50);
    return (data ?? []) as SystemMetric[];
  },
};
