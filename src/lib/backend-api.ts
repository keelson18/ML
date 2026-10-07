import { supabase } from './supabase';
import type { Candle, Timeframe } from './types';

async function authenticatedBackendRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Authentication required.');
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${session.access_token}`);
  const response = await fetch(path, { ...init, headers });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Backend request failed (${response.status}).`);
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
  grade: string; status: string; createdAt: string; updatedAt: string; datasetId: string;
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

export async function fetchTraderHistory<T>(kind: 'journal' | 'reviews' | 'events' | 'orders'): Promise<T[]> {
  const key = { journal: 'entries', reviews: 'reviews', events: 'events', orders: 'orders' }[kind];
  const result = await authenticatedBackendRequest<Record<string, T[]>>(`/api/v1/trader/${kind}?limit=20`);
  return result[key] ?? [];
}
