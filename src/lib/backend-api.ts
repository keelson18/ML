const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_BACKEND_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
import type { Candle, Timeframe } from './types';
import { fetchWithTimeout } from './providers/request';
import { supabase } from './supabase';

const API_TIMEOUT_MS = 10_000;

async function request(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init?.headers);
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);
  return fetchWithTimeout(input, { ...init, headers }, API_TIMEOUT_MS);
}

export interface BackendDecision {
  decision: 'BUY' | 'SELL' | 'HOLD' | 'WATCH' | 'NO_TRADE';
  confidence: number;
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
  const response = await request(`${API_BASE}/api/v1/autonomy/status`);
  if (!response.ok) throw new Error(`Autonomy status ${response.status}`);
  return response.json() as Promise<AutonomyStatus>;
}

export async function setAutonomyState(action: 'start' | 'pause') {
  const response = await request(`${API_BASE}/api/v1/autonomy/${action}`, { method: 'POST' });
  if (!response.ok) throw new Error(`Autonomy ${action} ${response.status}`);
  return response.json() as Promise<AutonomyStatus>;
}

export async function requestBackendDecision(symbol: string, timeframe: Timeframe, candles: Candle[]): Promise<BackendDecision | null> {
  const response = await request(`${API_BASE}/api/v1/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ symbol, timeframe, candles }),
  });
  if (!response.ok) throw new Error(`Backend analysis ${response.status}`);
  const payload = await response.json() as { decision: { result: BackendDecision } };
  return payload.decision.result;
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

export async function fetchPaperAccount(): Promise<PaperAccount> {
  const response = await request(`${API_BASE}/api/v1/paper/positions`);
  if (!response.ok) throw new Error(`Paper account ${response.status}`);
  return response.json() as Promise<PaperAccount>;
}
