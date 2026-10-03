import { supabase } from './supabase';
import { tradingApi } from '../api';
import type { Candle, Timeframe } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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

const DEFAULT_AUTONOMY: AutonomyStatus = {
  state: 'IDLE',
  processedDecisions: 0,
  executedOrders: 0,
  skippedRuns: 0,
  consecutiveFailures: 0,
};

export async function fetchAutonomyStatus(): Promise<AutonomyStatus> {
  return DEFAULT_AUTONOMY;
}

export async function setAutonomyState(action: 'start' | 'pause'): Promise<AutonomyStatus> {
  return {
    ...DEFAULT_AUTONOMY,
    state: action === 'start' ? 'MONITORING' : 'PAUSED',
  };
}

export async function requestBackendDecision(
  symbol: string,
  timeframe: Timeframe,
  candles: Candle[],
): Promise<BackendDecision | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/decision-analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_ANON_KEY ?? '',
      },
      body: JSON.stringify({ symbol, timeframe, candles }),
    });

    if (!res.ok) return null;
    const payload = await res.json() as { decision?: { result?: BackendDecision } };
    return payload.decision?.result ?? null;
  } catch {
    return null;
  }
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
  const { positions } = await tradingApi.getPositions();
  const { trades } = await tradingApi.getTrades();

  const mappedPositions: PaperPosition[] = positions.map((p) => ({
    id: p.id,
    symbol: p.symbol,
    side: p.side === 'long' ? 'buy' : 'sell',
    quantity: p.size,
    entryPrice: p.entry_price,
    entryFee: 0,
    stopLoss: p.stop_loss ?? undefined,
    takeProfit: p.take_profit ?? undefined,
    status: p.status as 'open' | 'closed',
    openedAt: p.opened_at,
    closedAt: p.closed_at ?? undefined,
  }));

  const mappedTrades: PaperTrade[] = trades.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    side: t.side === 'long' ? 'buy' : 'sell',
    quantity: t.size,
    entryPrice: t.price,
    exitPrice: t.price,
    realizedPnl: t.pnl,
    openedAt: t.executed_at,
    closedAt: t.executed_at,
  }));

  return {
    accountId: 'supabase',
    cash: 10000,
    positions: mappedPositions,
    trades: mappedTrades,
  };
}
