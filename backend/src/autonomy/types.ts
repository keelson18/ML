import type { Candle, Timeframe } from '../../../src/lib/types';
import type { TradeDecision } from '../engines/decision-engine';
import type { PaperAccountState, PaperOrderResult, PaperTrade } from '../engines/paper-execution';
import type { TradePlan } from '../trader/types';

export type AutonomousState = 'OFFLINE' | 'IDLE' | 'MONITORING' | 'DECIDING' | 'ARMED' | 'PAUSED' | 'PAUSED_BY_RISK' | 'ERROR';
export type PipelineRole = 'planner' | 'executor' | 'manager';

export interface AutonomousConfig {
  symbols: string[];
  timeframe: Timeframe;
  accountId: string;
  enableExecution: boolean;
  maxConsecutiveFailures: number;
}

export interface PipelineSnapshot {
  state: AutonomousState;
  lastRunAt?: string;
  lastClosedCandle?: { symbol: string; time: number };
  processedDecisions: number;
  executedOrders: number;
  skippedRuns: number;
  consecutiveFailures: number;
  lastError?: string;
  stateReason?: string;
}

export interface PipelineResult {
  role?: PipelineRole;
  symbol: string;
  timeframe: Timeframe;
  candle: Candle;
  decision?: TradeDecision;
  plan?: TradePlan;
  planReason?: string;
  order?: PaperOrderResult;
  closedTrades?: PaperTrade[];
  skipped?: string;
  marketDataStale?: boolean;
  state: AutonomousState;
}

export interface AccountView {
  account: PaperAccountState;
}
