const API_BASE = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.replace(/\/+$/, '');
const API_TIMEOUT_MS = 10000;
export const backendConfigured = Boolean(API_BASE);

async function request(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
import type { Candle, Timeframe } from './types';

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

const OFFLINE_STATUS: AutonomyStatus = {
  state: 'OFFLINE',
  processedDecisions: 0,
  executedOrders: 0,
  skippedRuns: 0,
  consecutiveFailures: 0,
};

export async function fetchAutonomyStatus(): Promise<AutonomyStatus> {
  if (!API_BASE) return OFFLINE_STATUS;
  const response = await request(`${API_BASE}/api/v1/autonomy/status`);
  if (!response.ok) throw new Error(`Autonomy status ${response.status}`);
  return response.json() as Promise<AutonomyStatus>;
}

export async function setAutonomyState(action: 'start' | 'pause') {
  if (!API_BASE) throw new Error('Backend URL is not configured.');
  const response = await request(`${API_BASE}/api/v1/autonomy/${action}`, { method: 'POST' });
  if (!response.ok) throw new Error(`Autonomy ${action} ${response.status}`);
  return response.json() as Promise<AutonomyStatus>;
}

export async function requestBackendDecision(symbol: string, timeframe: Timeframe, candles: Candle[]): Promise<BackendDecision | null> {
  if (!API_BASE) return null;
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

export async function fetchPaperAccount(accountId = 'default'): Promise<PaperAccount> {
  if (!API_BASE) throw new Error('Backend URL is not configured.');
  const response = await request(`${API_BASE}/api/v1/paper/positions?accountId=${encodeURIComponent(accountId)}`);
  if (!response.ok) throw new Error(`Paper account ${response.status}`);
  return response.json() as Promise<PaperAccount>;
}
