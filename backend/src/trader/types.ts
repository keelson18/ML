// Contracts for falsifiable plans, state changes, and trigger evidence.
import type { Candle, Timeframe } from '../../../src/lib/types';
import type { HtfBias, PlanStatus, SetupType, TriggerKind } from './constants';

export type PlanSide = 'long' | 'short';
export type PlanGrade = 'A' | 'B' | 'C';

export type TriggerRule =
  | { kind: 'close_above_level' | 'close_below_level' | 'higher_low_break'; level: number }
  | { kind: 'bullish_engulfing' | 'bearish_engulfing'; minVolumeMultiple: number };

export interface PlannedTarget {
  price: number;
  fractionOfPosition: number;
}

export interface TradePlan {
  id: string;
  accountId: string;
  symbol: string;
  side: PlanSide;
  setupType: SetupType;
  htfBias: HtfBias;
  zone: { low: number; high: number };
  trigger: TriggerRule;
  invalidation: number;
  targets: PlannedTarget[];
  minRR: number;
  expiresAtBar: number;
  createdAtBar?: number;
  lastReason?: string;
  activeEventIds?: string[];
  thesis: string;
  falsification: string;
  grade: PlanGrade;
  status: PlanStatus;
  contextSnapshot: Record<string, number | string>;
  engineVersions: Record<string, string>;
  datasetId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanEvent {
  id: string;
  planId: string;
  accountId: string;
  fromStatus: PlanStatus | null;
  toStatus: PlanStatus;
  actor: 'system' | 'planner' | 'executor' | 'manager' | 'user';
  reason: string;
  candle?: Pick<Candle, 'time' | 'open' | 'high' | 'low' | 'close'>;
  timeframe?: Timeframe;
  engineVersion?: string;
  activeEventIds?: string[];
  occurredAt: string;
}

export interface PendingPaperOrder {
  id: string;
  planId: string;
  accountId: string;
  symbol: string;
  side: PlanSide;
  orderType: 'limit' | 'stop_entry';
  price: number;
  quantity: number;
  createdAtBar: number;
  expiresAtBar: number;
  status: 'pending' | 'filled' | 'cancelled';
}

export interface RiskSnapshot {
  equity: number;
  openRiskCash: number;
  portfolioHeatPct: number;
  dailyPnlPct: number;
  weeklyPnlPct: number;
  consecutiveLosses: number;
  cooldownUntilBar: number | null;
  openPositionCount: number;
  correlatedPositionCount: number;
}

export interface PlannerInput {
  accountId: string;
  symbol: string;
  htfCandles: Partial<Record<Timeframe, Candle[]>>;
  triggerCandles: Candle[];
  triggerTimeframe?: Timeframe;
  datasetId: string;
}

// This guards accidental vocabulary drift between the domain contract and constants.
export type DeclaredTriggerKind = TriggerRule['kind'] extends TriggerKind ? TriggerRule['kind'] : never;
