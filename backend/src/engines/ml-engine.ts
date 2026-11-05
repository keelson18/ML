import type { MLPrediction } from '../../../src/lib/types';
import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';

export interface MLEngineContext extends EngineContext {
  prediction?: MLPrediction;
  featureSnapshot?: Record<string, number>;
  datasetId?: string;
  calibration?: {
    modelVersion: string;
    timeframe: string;
    sampleCount: number;
    brierScore: number;
    measuredAt: string;
  };
}

export interface MLPredictionAnalysis {
  available: boolean;
  prediction?: MLPrediction;
  featureCount: number;
  lineageComplete: boolean;
  calibrated: boolean;
  usable: boolean;
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
    const lineageMatches = Boolean(
      prediction
      && prediction.pair === context.symbol
      && prediction.timeframe === context.timeframe
      && prediction.dataset_id === context.datasetId,
    );
    const predictionAgeMs = prediction?.prediction_timestamp
      ? Date.now() - Date.parse(prediction.prediction_timestamp)
      : Number.POSITIVE_INFINITY;
    const dataFresh = prediction?.data_fetched_at !== undefined
      && Number.isFinite(prediction.data_fetched_at)
      && Date.now() - prediction.data_fetched_at <= 5 * 60 * 1000;
    const calibrated = Boolean(prediction
      && context.calibration
      && context.calibration.modelVersion === prediction.model_version
      && context.calibration.timeframe === prediction.timeframe
      && context.calibration.sampleCount > 0
      && Number.isFinite(context.calibration.brierScore)
      && context.calibration.brierScore >= 0
      && context.calibration.brierScore <= 1
      && Number.isFinite(Date.parse(context.calibration.measuredAt)));
    const usable = Boolean(prediction && lineageComplete && lineageMatches && dataFresh && prediction.edge_status === 'beats-momentum-baseline');
    const result: MLPredictionAnalysis = {
      available: prediction !== undefined,
      prediction,
      featureCount,
      lineageComplete,
      calibrated,
      usable,
    };
    const warnings: string[] = [];
    if (!prediction) warnings.push('No ML prediction was supplied.');
    else if (!lineageComplete || !lineageMatches) warnings.push('ML prediction lineage is incomplete or mismatched; prediction is informational only.');
    else if (!dataFresh || !Number.isFinite(predictionAgeMs) || predictionAgeMs < 0) warnings.push('ML prediction is stale or has an invalid timestamp; prediction is informational only.');
    else if (prediction.edge_status !== 'beats-momentum-baseline') warnings.push('ML model has no validated edge over the momentum baseline; prediction is informational only.');
    const evidence: EngineEvidence[] = prediction
      ? [{
        id: `${ENGINE_NAME}:${prediction.model_version}:${prediction.pair}:${prediction.timeframe}`,
        kind: 'predicted',
        source: ENGINE_NAME,
        direction: prediction.prediction === 'up' ? 'bullish' : prediction.prediction === 'down' ? 'bearish' : 'neutral',
        score: usable ? prediction.probability : 0,
        explanation: `${prediction.prediction} prediction at ${(prediction.probability * 100).toFixed(1)}% probability from model ${prediction.model_version}.`,
      }]
      : [];

    return {
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      timestamp: new Date().toISOString(),
      inputContextId: context.inputContextId,
      status: usable ? 'ok' : 'degraded',
      result,
      confidence: usable ? (prediction?.probability ?? 0) : 0,
      evidence,
      warnings,
      latencyMs: performance.now() - startedAt,
    };
  },
};
