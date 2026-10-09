import { supabase } from './supabase';
import { readJsonSafe } from '../../shared/http';
import type { Candle, Timeframe } from './types';

async function authenticatedBackendRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Authentication required.');
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${session.access_token}`);
  const response = await fetch(path, { ...init, headers });
  const { raw, payload } = await readJsonSafe<T & { error?: string }>(response);
  if (!response.ok) {
    if (payload?.error) throw new Error(payload.error);
    if (response.status !== 401 && (!raw || [502, 503, 504].includes(response.status))) {
      throw new Error('The trading backend is unreachable. Check that it is running, then retry.');
    }
    throw new Error(`Backend request failed (${response.status}).`);
  }
  if (payload === null) throw new Error('The backend returned an empty or invalid response.');
  return payload;
}

export interface BackendDecision {
  decision: 'BUY' | 'SELL' | 'HOLD' | 'WATCH' | 'NO_TRADE';
  confidence: number;
  entry?: number;
  invalidation?: number;
  targets?: { price: number }[];
  strategy: string;
  supportingEvidence: { source: string; explanation: string; score?: number }[];
  contradictions: string[];
  reasoning: string;
  explanation: string;
  timestamp: string;
}

export interface AutonomyStatus {
  state: 'OFFLINE' | 'IDLE' | 'MONITORING' | 'DECIDING' | 'PAUSED' | 'ERROR';
  lastRunAt?: string;
  processedDecisions: number;
  executedOrders: number;
  skippedRuns: number;
  consecutiveFailures: number;
  lastError?: string;
}

export async function fetchAutonomyStatus(): Promise<AutonomyStatus> {
  return authenticatedBackendRequest<AutonomyStatus>('/api/v1/autonomy/status');
}

export async function setAutonomyState(action: 'start' | 'pause'): Promise<AutonomyStatus> {
  return authenticatedBackendRequest<AutonomyStatus>(`/api/v1/autonomy/${action}`, { method: 'POST' });
}

export async function requestBackendDecision(
  symbol: string,
  timeframe: Timeframe,
  candles: Candle[],
): Promise<BackendDecision | null> {
  const payload = await authenticatedBackendRequest<{ decision?: { result?: BackendDecision } }>('/api/v1/decisions/analyze', {
    method: 'POST',
    body: JSON.stringify({ symbol, timeframe, candles }),
  });
  return payload.decision?.result ?? null;
}

export interface PaperOrderResult {
  accepted: boolean;
  status: 'filled' | 'rejected';
  reason?: string;
  fillPrice?: number;
  fee?: number;
}

export async function executePaperTrade(symbol: string, timeframe: Timeframe): Promise<PaperOrderResult> {
  return authenticatedBackendRequest<PaperOrderResult>('/api/v1/paper/execute', {
    method: 'POST',
    body: JSON.stringify({ symbol, timeframe }),
  });
}

export interface PaperPosition {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  entryPrice: number;
  entryFee: number;
  stopLoss?: number;
  takeProfit?: number;
  status: 'open' | 'closed';
  openedAt: string;
  closedAt?: string;
}

export interface PaperTrade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  realizedPnl: number;
  maeR: number | null;
  mfeR: number | null;
  openedAt: string;
  closedAt: string;
}

export interface PaperAccount {
  accountId: string;
  cash: number;
  positions: PaperPosition[];
  trades: PaperTrade[];
}

export interface MarketDataResponse {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  fetchedAt: number;
  stale: boolean;
}

export async function downloadPersonalDataExport(): Promise<Blob> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Authentication required.');
  const response = await fetch('/api/v1/me/export', { headers: { Authorization: `Bearer ${session.access_token}` } });
  const { raw, payload } = await readJsonSafe<{ error?: string }>(response);
  if (!response.ok) {
    if (payload?.error) throw new Error(payload.error);
    if (!raw || [502, 503, 504].includes(response.status)) throw new Error('Personal data export is unavailable. Please retry later.');
    throw new Error(`Export request failed (${response.status}).`);
  }
  if (!raw) throw new Error('The export returned an empty response.');
  return new Blob([raw], { type: 'application/json' });
}

export interface EventBlackout {
  id: string;
  title: string;
  impact: 'low' | 'medium' | 'high';
  asset_classes: string[];
  starts_at: string;
  ends_at: string;
  active?: boolean;
  created_at?: string;
  cancelled_at?: string | null;
}

export interface NewsItem {
  id: string;
  provider: string;
  title: string;
  summary: string;
  symbols: string[];
  published_at: string | null;
  ingested_at: string;
}

export interface CalendarEvent extends EventBlackout {
  source: 'manual' | 'provider';
}

export async function fetchNewsItems(symbol?: string): Promise<{ items: NewsItem[]; availability: 'unverified' | 'available' | 'unavailable'; asOf: string }> {
  const query = new URLSearchParams();
  if (symbol) query.set('symbol', symbol);
  return authenticatedBackendRequest(`/api/v1/news/items?${query}`);
}

export async function fetchCalendarEvents(): Promise<{ events: CalendarEvent[]; availability: 'unverified' | 'available' | 'unavailable'; asOf: string }> {
  return authenticatedBackendRequest('/api/v1/calendar/events');
}

export async function fetchNewsProviderStatus(): Promise<{ news: Array<{ provider: string; availability: 'unverified' | 'available' | 'unavailable'; checkedAt: string | null }>; calendar: Array<{ provider: string; availability: 'unverified' | 'available' | 'unavailable'; checkedAt: string | null }> }> {
  return authenticatedBackendRequest('/api/v1/news/status');
}

export async function fetchActiveEventBlackouts(): Promise<EventBlackout[]> {
  const result = await authenticatedBackendRequest<{ events: EventBlackout[] }>('/api/v1/events/active');
  return result.events;
}

export async function fetchAdminEventBlackouts(): Promise<EventBlackout[]> {
  const result = await authenticatedBackendRequest<{ events: EventBlackout[] }>('/api/v1/admin/event-blackouts');
  return result.events;
}

export async function createEventBlackout(input: { title: string; impact: EventBlackout['impact']; assetClasses: string[]; startsAt: string; endsAt: string }): Promise<string> {
  const result = await authenticatedBackendRequest<{ id: string }>('/api/v1/admin/event-blackouts', { method: 'POST', body: JSON.stringify(input) });
  return result.id;
}

export async function cancelEventBlackout(id: string): Promise<void> {
  await authenticatedBackendRequest(`/api/v1/admin/event-blackouts/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
}

export interface MarketAvailabilityRecord {
  symbol: string;
  status: 'available' | 'unavailable' | 'unverified';
  checkedAt: number | null;
  candleCount?: number;
}

export async function fetchMarketAvailability(admin = false): Promise<MarketAvailabilityRecord[]> {
  const path = admin ? '/api/v1/admin/markets/availability' : '/api/v1/market/availability';
  const payload = await authenticatedBackendRequest<{ markets: MarketAvailabilityRecord[] }>(path);
  return payload.markets;
}

export async function probeMarkets(): Promise<MarketAvailabilityRecord[]> {
  const payload = await authenticatedBackendRequest<{ markets: MarketAvailabilityRecord[] }>('/api/v1/admin/markets/probe', { method: 'POST' });
  return payload.markets;
}

export async function fetchCanonicalMarketData(symbol: string, timeframe: Timeframe, limit = 1000): Promise<MarketDataResponse> {
  const query = new URLSearchParams({ timeframe, limit: String(limit) });
  return authenticatedBackendRequest<MarketDataResponse>(`/api/v1/market/candles/${encodeURIComponent(symbol)}?${query}`);
}

export async function fetchPaperAccount(): Promise<PaperAccount> {
  return authenticatedBackendRequest<PaperAccount>('/api/v1/paper/positions');
}

export async function closePaperPosition(symbol: string): Promise<PaperTrade> {
  const { trade } = await authenticatedBackendRequest<{ trade: PaperTrade }>('/api/v1/paper/close', {
    method: 'POST',
    body: JSON.stringify({ symbol }),
  });
  return trade;
}

export interface TraderPlan {
  id: string; symbol: string; side: 'long' | 'short'; setupType: string; htfBias: string;
  zone: { low: number; high: number }; trigger: { kind: string; level?: number };
  invalidation: number; targets: Array<{ price: number; fractionOfPosition: number }>;
  minRR: number; expiresAtBar: number; thesis: string; falsification: string;
  grade: string; status: string; createdAt: string; updatedAt: string; datasetId: string; lastReason?: string; activeEventIds?: string[];
}

export interface TraderOverview {
  cash: number; startingEquity: number; equity: number; unrealizedPnl: number; drawdownPct: number;
  openRiskCash: number; heatPct: number; dailyPnl: number; weeklyPnl: number;
  dailyLossLimitPct: number; weeklyLossLimitPct: number; staleSymbols: string[];
  positions: Array<PaperPosition & { currentPrice: number; unrealizedPnl: number; rMultiple: number }>;
  recentTrades: PaperTrade[];
}

export async function fetchTraderPlans(): Promise<TraderPlan[]> {
  const result = await authenticatedBackendRequest<{ plans: TraderPlan[] }>('/api/v1/trader/plans');
  return result.plans;
}

export async function fetchTraderOverview(): Promise<TraderOverview> {
  return authenticatedBackendRequest<TraderOverview>('/api/v1/trader/overview');
}

export async function refreshTraderPlans(): Promise<{ plans: TraderPlan[]; watchlist: Array<{ bias: string; regime: string; keyLevels: number[]; qualityScore: number; reason: string }>; count: number }> {
  return authenticatedBackendRequest('/api/v1/trader/plans/refresh', { method: 'POST' });
}

export interface TraderAdvanceResult {
  advancedPlans: number;
  filledOrders: number;
  shadowSignals: Array<{ planId: string; candleTime: number; reason: string }>;
  closedTrades: PaperTrade[];
  staleSymbols: string[];
  shadowMode: boolean;
}

export async function advanceTraderPlans(): Promise<TraderAdvanceResult> {
  return authenticatedBackendRequest<TraderAdvanceResult>('/api/v1/trader/advance', { method: 'POST' });
}

export async function fetchTraderHistory<T>(kind: 'journal' | 'reviews' | 'events' | 'orders'): Promise<T[]> {
  const key = { journal: 'entries', reviews: 'reviews', events: 'events', orders: 'orders' }[kind];
  const result = await authenticatedBackendRequest<Record<string, T[]>>(`/api/v1/trader/${kind}?limit=20`);
  return result[key] ?? [];
}
