import type { Candle, Timeframe } from '../types';

export type EngineStatus = 'ok' | 'degraded' | 'failed';

export type EvidenceKind = 'observed' | 'calculated' | 'inferred' | 'predicted' | 'historical';

export interface EngineEvidence {
  id: string;
  kind: EvidenceKind;
  source: string;
  direction?: 'bullish' | 'bearish' | 'neutral';
  score?: number;
  explanation: string;
}

export interface EngineContext {
  inputContextId: string;
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  observedAt?: number;
}

export interface EngineResult<TResult> {
  engineName: string;
  engineVersion: string;
  timestamp: string;
  inputContextId: string;
  status: EngineStatus;
  result: TResult;
  confidence: number;
  evidence: EngineEvidence[];
  warnings: string[];
  latencyMs: number;
  correlationId?: string;
}

export interface IntelligenceEngine<TResult> {
  readonly name: string;
  readonly version: string;
  analyze(context: EngineContext): EngineResult<TResult>;
}