import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';
import type { MarketIntelligenceSnapshot } from './orchestrator';

/**
 * Confidence Engine (AI Engine Specification §22)
 *
 * Confidence is NOT a naive weighted average of signals. It is a structured
 * multi-factor model that weighs:
 *   - evidence quality
 *   - evidence agreement
 *   - evidence independence
 *   - historical sample quality
 *   - model calibration
 *   - regime stability
 *   - data freshness
 *   - risk conditions
 *
 * Confidence must NEVER override hard risk constraints. If a hard risk or
 * portfolio gate is not approved, the confidence floor is forced to zero.
 */

export interface ConfidenceFactor {
  factor: string;
  score: number; // 0..1
  weight: number; // relative weight in the breakdown
  explanation: string;
}

export interface ConfidenceAnalysis {
  overall: number; // 0..1
  factors: ConfidenceFactor[];
  riskBlocked: boolean;
  dataQualityBlocked: boolean;
  decisionDirection: 'buy' | 'sell' | 'neutral';
}

export interface ConfidenceEngineContext extends EngineContext {
  market: MarketIntelligenceSnapshot;
  evidence: EngineEvidence[];
  contradictions: { severity: 'low' | 'medium' | 'high'; detail: string }[];
  riskApproved: boolean;
  portfolioApproved: boolean;
  dataQualityBlocked: boolean;
  decisionDirection: 'buy' | 'sell' | 'neutral';
  historicalSampleQuality?: 'high' | 'medium' | 'low' | 'none';
  modelProbability?: number;
  modelCalibrated?: boolean;
}

const ENGINE_NAME = 'confidence';
const ENGINE_VERSION = '1.0.0';

function evidenceQuality(evidence: EngineEvidence[]): number {
  if (evidence.length === 0) return 0;
  const weights: Record<EngineEvidence['kind'], number> = {
    observed: 1,
    calculated: 0.85,
    historical: 0.7,
    predicted: 0.5,
    inferred: 0.4,
  };
  const avg = evidence.reduce((sum, item) => sum + (weights[item.kind] ?? 0.5), 0) / evidence.length;
  return avg;
}

function evidenceAgreement(evidence: EngineEvidence[], direction: 'buy' | 'sell' | 'neutral'): number {
  if (evidence.length === 0 || direction === 'neutral') return 0.5;
  const directional = evidence.filter((item) => item.direction !== 'neutral');
  if (directional.length === 0) return 0.5;
  const target = direction === 'buy' ? 'bullish' : 'bearish';
  const agreeing = directional.filter((item) => item.direction === target).length;
  return agreeing / directional.length;
}

function evidenceIndependence(evidence: EngineEvidence[]): number {
  if (evidence.length === 0) return 0.5;
  const sources = new Set(evidence.map((item) => item.source));
  return Math.min(1, sources.size / Math.max(evidence.length, 1) + (sources.size >= 3 ? 0.25 : 0));
}

function regimeStability(market: MarketIntelligenceSnapshot): number {
  const regime = market.regime.result.regime;
if (regime === 'uncertain' || regime === 'transition') return 0.2;
  if (regime === 'ranging') return 0.5;
  return market.regime.confidence;
}

function weightFor(factor: string): number {
  const weights: Record<string, number> = {
    'evidence-quality': 0.2,
    'evidence-agreement': 0.2,
    'evidence-independence': 0.1,
    'historical-sample': 0.15,
    'model-calibration': 0.1,
    'regime-stability': 0.1,
    'data-freshness': 0.1,
    'risk-conditions': 0.05,
  };
  return weights[factor] ?? 0.1;
}

export const confidenceEngine: IntelligenceEngine<ConfidenceAnalysis> & {
  analyze(context: ConfidenceEngineContext): EngineResult<ConfidenceAnalysis>;
} = {
  name: ENGINE_NAME,
  version: ENGINE_VERSION,

  analyze(context: ConfidenceEngineContext): EngineResult<ConfidenceAnalysis> {
    const startedAt = performance.now();
    const factors: ConfidenceFactor[] = [];

    const quality = evidenceQuality(context.evidence);
    factors.push({
      factor: 'evidence-quality',
      score: quality,
      weight: weightFor('evidence-quality'),
      explanation: `Evidence quality is ${quality.toFixed(2)} across ${context.evidence.length} evidence item(s).`,
    });

    const agreement = evidenceAgreement(context.evidence, context.decisionDirection);
    factors.push({
      factor: 'evidence-agreement',
      score: agreement,
      weight: weightFor('evidence-agreement'),
      explanation: `Evidence agreement toward the ${context.decisionDirection} direction is ${(agreement * 100).toFixed(0)}%.`,
    });

    const independence = evidenceIndependence(context.evidence);
    factors.push({
      factor: 'evidence-independence',
      score: independence,
      weight: weightFor('evidence-independence'),
      explanation: `Evidence independence is ${(independence * 100).toFixed(0)}% based on ${new Set(context.evidence.map((item) => item.source)).size} distinct source(s).`,
    });

    const sampleQuality = context.historicalSampleQuality ?? 'none';
    const sampleScore = sampleQuality === 'high' ? 0.8 : sampleQuality === 'medium' ? 0.5 : sampleQuality === 'low' ? 0.25 : 0;
    factors.push({
      factor: 'historical-sample',
      score: sampleScore,
      weight: weightFor('historical-sample'),
      explanation: `Historical sample quality is ${sampleQuality}.`,
    });

    const calibration = context.modelCalibrated === true ? 1 : context.modelProbability !== undefined ? context.modelProbability : 0.5;
    factors.push({
      factor: 'model-calibration',
      score: calibration,
      weight: weightFor('model-calibration'),
      explanation: context.modelCalibrated === true
        ? 'Model evidence is calibrated and lineage-complete.'
        : 'Model evidence is uncalibrated or absent; neutralizing the model factor.',
    });

    const stability = regimeStability(context.market);
    factors.push({
      factor: 'regime-stability',
      score: stability,
      weight: weightFor('regime-stability'),
      explanation: `Regime stability contributes ${(stability * 100).toFixed(0)}% based on the ${context.market.regime.result.regime} regime.`,
    });

    const dataFreshness = context.dataQualityBlocked ? 0 : context.market.dataQuality.result.freshnessStatus === 'stale' ? 0.3 : 0.8;
    factors.push({
      factor: 'data-freshness',
      score: dataFreshness,
      weight: weightFor('data-freshness'),
      explanation: context.dataQualityBlocked
        ? 'Data quality is blocked; the confidence floor is forced to zero.'
        : `Data freshness is ${context.market.dataQuality.result.freshnessStatus}.`,
    });

    const riskConditions = context.riskApproved && context.portfolioApproved ? 1 : 0;
    factors.push({
      factor: 'risk-conditions',
      score: riskConditions,
      weight: weightFor('risk-conditions'),
      explanation: context.riskApproved && context.portfolioApproved
        ? 'Risk and portfolio gates are approved.'
        : 'Risk or portfolio gate is rejected; hard constraint blocks confidence.',
    });

    const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
    const weighted = factors.reduce((sum, factor) => sum + factor.weight * factor.score, 0);
    const overall = totalWeight > 0 ? weighted / totalWeight : 0;

    // Hard constraint: risk/portfolio rejection or data-quality block forces the floor to zero.
    const riskBlocked = !context.riskApproved || !context.portfolioApproved;
    const finalConfidence = context.dataQualityBlocked || riskBlocked ? 0 : overall;

    // Contradictions reduce confidence proportionally to severity.
    const contradictionPenalty = context.contradictions.reduce((sum, c) => {
      if (c.severity === 'high') return sum + 0.4;
      if (c.severity === 'medium') return sum + 0.2;
      return sum + 0.1;
    }, 0);
    const reduced = Math.max(0, finalConfidence * (1 - contradictionPenalty));

    const result: ConfidenceAnalysis = {
      overall: reduced,
      factors,
      riskBlocked,
      dataQualityBlocked: context.dataQualityBlocked,
      decisionDirection: context.decisionDirection,
    };

    const evidence: EngineEvidence[] = factors.map((factor) => ({
      id: `${ENGINE_NAME}:${factor.factor}`,
      kind: 'calculated',
      source: ENGINE_NAME,
      direction: 'neutral',
      score: factor.score,
      explanation: factor.explanation,
    }));

    return {
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      timestamp: new Date().toISOString(),
      inputContextId: context.inputContextId,
      status: riskBlocked ? 'degraded' : 'ok',
      result,
      confidence: reduced,
      evidence,
      warnings: riskBlocked
        ? ['Hard risk or portfolio constraints are not satisfied; confidence is forced to zero.']
        : context.dataQualityBlocked
          ? ['Data quality is blocked; confidence is forced to zero.']
          : [],
      latencyMs: performance.now() - startedAt,
    };
  },
};
