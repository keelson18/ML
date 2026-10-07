import type { Candle, Timeframe } from '../../../src/lib/types';
import type { TradeDecision } from '../engines/decision-engine';
import type { PaperAccountState, PaperOrderResult, PaperTrade } from '../engines/paper-execution';

export type AutonomousState = 'OFFLINE' | 'IDLE' | 'MONITORING' | 'DECIDING' | 'PAUSED' | 'ERROR';

export interface AutonomousConfig {
  symbols: string[];
  timeframe: Timeframe;
  accountId: string;
  enableExecution: boolean;
  killZonesUtc: Array<{ startHour: number; endHour: number }>;
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
}

export interface PipelineResult {
  symbol: string;
  timeframe: Timeframe;
  candle: Candle;
  decision?: TradeDecision;
  order?: PaperOrderResult;
  closedTrades?: PaperTrade[];
  skipped?: string;
  marketDataStale?: boolean;
  state: AutonomousState;
}

export interface AccountView {
  account: PaperAccountState;
}
