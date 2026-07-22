import type { MLPrediction } from '../types';

// Ensemble voting system: combine multiple ML model predictions

export interface ModelOutput {
  modelName: string;
  prediction: 'up' | 'down' | 'flat';
  probability: number;
  weight: number; // model weight in ensemble
}

export interface EnsembleResult {
  prediction: 'up' | 'down' | 'flat';
  probability: number;
  confidence: 'low' | 'medium' | 'high';
  contributors: { model: string; weight: number; vote: string }[];
  agreement: number; // 0-1 how much models agree
}

// Weighted voting ensemble
export function weightedEnsemble(models: ModelOutput[]): EnsembleResult {
  if (models.length === 0) {
    return { prediction: 'flat', probability: 0.5, confidence: 'low', contributors: [], agreement: 0 };
  }

  const totalWeight = models.reduce((s, m) => s + m.weight, 0);

  let upWeight = 0;
  let downWeight = 0;
  let flatWeight = 0;

  const contributors: { model: string; weight: number; vote: string }[] = [];

  for (const m of models) {
    const w = m.weight / totalWeight;
    if (m.prediction === 'up') upWeight += w;
    else if (m.prediction === 'down') downWeight += w;
    else flatWeight += w;
    contributors.push({ model: m.modelName, weight: w, vote: m.prediction });
  }

  // Determine prediction
  let prediction: 'up' | 'down' | 'flat';
  let probability: number;

  if (upWeight > downWeight && upWeight > flatWeight) {
    prediction = 'up';
    probability = upWeight;
  } else if (downWeight > upWeight && downWeight > flatWeight) {
    prediction = 'down';
    probability = downWeight;
  } else {
    prediction = 'flat';
    probability = flatWeight;
  }

  // Agreement: how concentrated the votes are
  const maxWeight = Math.max(upWeight, downWeight, flatWeight);
  const agreement = maxWeight > 0.5 ? maxWeight : 0.5;

  // Confidence
  let confidence: 'low' | 'medium' | 'high';
  if (probability >= 0.7 && agreement >= 0.6) confidence = 'high';
  else if (probability >= 0.5 && agreement >= 0.4) confidence = 'medium';
  else confidence = 'low';

  return { prediction, probability, confidence, contributors, agreement };
}

// Convert ensemble result to MLPrediction format
export function ensembleToMLPrediction(
  ensemble: EnsembleResult,
  symbol: string,
  timeframe: string,
  expectedMovePct: number,
  modelVersion: string,
): MLPrediction {
  return {
    pair: symbol,
    timeframe: timeframe as any,
    prediction: ensemble.prediction,
    probability: ensemble.probability,
    expected_move_pct: expectedMovePct * (ensemble.prediction === 'up' ? 1 : ensemble.prediction === 'down' ? -1 : 0),
    model_version: modelVersion,
    confidence: ensemble.confidence,
  };
}

