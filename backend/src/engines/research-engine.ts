import type { Candle, Signal } from '../../../src/lib/types';
import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';

export interface ResearchContext extends EngineContext {
  datasetId: string;
  experimentVersion: string;
  candles: Candle[];
  signalFn: (candles: Candle[]) => Signal[];
  trainingEndIndex: number;
  testStartIndex: number;
  testStartTime?: number;
  transactionCostRate: number;
  slippageRate: number;
}

export interface ResearchAnalysis {
  reproducible: boolean;
  leakageDetected: boolean;
  chronological: boolean;
  outOfSampleReady: boolean;
  validationState: 'INSUFFICIENT_EVIDENCE' | 'INVALID_DESIGN';
  sampleSize: number;
  datasetId: string;
  experimentVersion: string;
  warnings: string[];
}

const ENGINE_NAME = 'research-intelligence';
const ENGINE_VERSION = '1.0.0';

function chronological(candles: Candle[]): boolean {
  return candles.every((candle, index) => index === 0 || candle.time > candles[index - 1].time);
}

export const researchIntelligenceEngine: IntelligenceEngine<ResearchAnalysis> & {
  analyze(context: ResearchContext): EngineResult<ResearchAnalysis>;
} = {
  name: ENGINE_NAME,
  version: ENGINE_VERSION,

  analyze(context: ResearchContext): EngineResult<ResearchAnalysis> {
    const startedAt = performance.now();
    const warnings: string[] = [];
    const isChronological = chronological(context.candles);
    const splitValid = context.trainingEndIndex > 0
      && context.testStartIndex >= context.trainingEndIndex
      && context.testStartIndex < context.candles.length;
    const costsValid = Number.isFinite(context.transactionCostRate)
      && context.transactionCostRate >= 0
      && Number.isFinite(context.slippageRate)
      && context.slippageRate >= 0;
    if (!isChronological) warnings.push('Dataset timestamps are not strictly chronological.');
    if (!splitValid) warnings.push('Training and out-of-sample boundaries are invalid.');
    if (!costsValid) warnings.push('Transaction cost and slippage assumptions must be non-negative finite values.');
    warnings.push('No deterministic fill/outcome evaluator or realized out-of-sample metrics were supplied; this design cannot establish validation.');
    const leakageDetected = !splitValid || !isChronological;
    const result: ResearchAnalysis = {
      reproducible: false,
      leakageDetected,
      chronological: isChronological,
      outOfSampleReady: false,
      validationState: leakageDetected || !costsValid ? 'INVALID_DESIGN' : 'INSUFFICIENT_EVIDENCE',
      sampleSize: 0,
      datasetId: context.datasetId,
      experimentVersion: context.experimentVersion,
      warnings,
    };
    const evidence: EngineEvidence[] = [
      {
        id: `${ENGINE_NAME}:dataset`,
        kind: 'observed',
        source: ENGINE_NAME,
        direction: 'neutral',
        explanation: `Research dataset ${context.datasetId} uses experiment ${context.experimentVersion}.`,
      },
      {
        id: `${ENGINE_NAME}:leakage`,
        kind: 'calculated',
        source: ENGINE_NAME,
        direction: 'neutral',
        score: result.leakageDetected ? 1 : 0,
        explanation: result.leakageDetected ? 'Research design failed chronological or split safeguards.' : 'Chronology and split boundaries were checked; no realized outcome evaluation was provided.',
      },
    ];

    return {
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      timestamp: new Date().toISOString(),
      inputContextId: context.inputContextId,
      status: result.outOfSampleReady ? 'ok' : 'degraded',
      result,
      confidence: result.outOfSampleReady ? 0.8 : 0,
      evidence,
      warnings,
      latencyMs: performance.now() - startedAt,
    };
  },
};
