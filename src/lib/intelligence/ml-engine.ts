import type { MLPrediction } from '../types';
import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';

export interface MLEngineContext extends EngineContext {
  prediction?: MLPrediction;
  featureSnapshot?: Record<string, number>;
  datasetId?: string;
}

export interface MLPredictionAnalysis {
  available: boolean;
  prediction?: MLPrediction;
  featureCount: number;
  lineageComplete: boolean;
}

const ENGINE_NAME = 'ml-intelligence';
const ENGINE_VERSION = '1.0.0';

export const mlIntelligenceEngine: IntelligenceEngine<MLPredictionAnalysis> & {
  analyze(context: MLEngineContext): EngineResult<MLPredictionAnalysis>;
} = {
  name: ENGINE_NAME,
  version: ENGINE_VERSION,

  analyze(context: MLEngineContext): EngineResult<MLPredictionAnalysis> {
    const startedAt = performance.now();
    const prediction = context.prediction;
    const featureCount = context.featureSnapshot ? Object.keys(context.featureSnapshot).length : 0;
    const lineageComplete = Boolean(prediction?.model_version && context.datasetId && featureCount > 0);
    const result: MLPredictionAnalysis = {
      available: prediction !== undefined,
      prediction,
      featureCount,
      lineageComplete,
    };
    const warnings: string[] = [];
    if (!prediction) warnings.push('No ML prediction was supplied.');
    else if (!lineageComplete) warnings.push('ML prediction lineage is incomplete; prediction is informational only.');
    const evidence: EngineEvidence[] = prediction
      ? [{
        id: `${ENGINE_NAME}:${prediction.model_version}:${prediction.pair}:${prediction.timeframe}`,
        kind: 'predicted',
        source: ENGINE_NAME,
        direction: prediction.prediction === 'up' ? 'bullish' : prediction.prediction === 'down' ? 'bearish' : 'neutral',
        score: prediction.probability,
        explanation: `${prediction.prediction} prediction at ${(prediction.probability * 100).toFixed(1)}% probability from model ${prediction.model_version}.`,
      }]
      : [];

    return {
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      timestamp: new Date().toISOString(),
      inputContextId: context.inputContextId,
      status: prediction && lineageComplete ? 'ok' : 'degraded',
      result,
      confidence: prediction && lineageComplete ? prediction.probability : 0,
      evidence,
      warnings,
      latencyMs: performance.now() - startedAt,
    };
  },
};