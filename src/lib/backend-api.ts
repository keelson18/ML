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
