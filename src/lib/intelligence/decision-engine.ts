import type { Side, Signal } from '../types';
import { aiReasoningEngine } from './ai-reasoning-engine';
import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';
import { analyzeMarketIntelligence } from './orchestrator';
import { contradictionEngine } from './contradiction-engine';
import { confidenceEngine } from './confidence-engine';
import { historicalSimilarityEngine, type HistoricalCase } from './historical-similarity-engine';
import { knowledgeIntelligenceEngine, type KnowledgeNode } from './knowledge-engine';
import { mlIntelligenceEngine, type MLPredictionAnalysis } from './ml-engine';
import { portfolioIntelligenceEngine, type PortfolioEngineContext } from './portfolio-engine';
import { riskIntelligenceEngine, type RiskEngineContext } from './risk-engine';

export type TradeDecisionType = 'BUY' | 'SELL' | 'HOLD' | 'WATCH' | 'NO_TRADE';

export interface DecisionEngineContext extends EngineContext {
  risk: RiskEngineContext['risk'];
  portfolio: PortfolioEngineContext['portfolio'];
  ml?: {
    prediction?: MLPredictionAnalysis['prediction'];
    featureSnapshot?: Record<string, number>;
    datasetId?: string;
  };
  historical?: {
    currentFeatureVector: number[];
    historicalCases: HistoricalCase[];
    minimumSimilarity?: number;
  };
  knowledge?: {
    queryTags: string[];
    knowledgeNodes: KnowledgeNode[];
  };
}

export interface TradeDecision {
  decision: TradeDecisionType;
  confidence: number;
  entry?: number;
  entryZone?: { low: number; high: number };
  invalidation?: number;
  targets?: { price: number }[];
  strategy: string;
  supportingEvidence: EngineEvidence[];
  contradictions: string[];
  reasoning: string;
  explanation: string;
  engineVersions: Record<string, string>;
  timestamp: string;
}

const ENGINE_NAME = 'master-decision';
const ENGINE_VERSION = '1.0.0';

function signalScore(signals: Signal[]): { buy: number; sell: number } {
  return signals.reduce(
    (score, signal) => {
      if (signal.side === 'buy') score.buy += signal.confidence;
      if (signal.side === 'sell') score.sell += signal.confidence;
      return score;
    },
    { buy: 0, sell: 0 },
  );
}

function directionalEvidence(signals: Signal[]): EngineEvidence[] {
  return signals
    .filter((signal) => signal.side !== 'neutral')
    .map((signal, index) => ({
      id: `${ENGINE_NAME}:signal:${index}`,
      kind: 'calculated',
      source: signal.strategy,
      direction: signal.side === 'buy' ? 'bullish' : 'bearish',
      score: signal.confidence,
      explanation: signal.reason,
    }));
}

function directionForDecision(decision: TradeDecisionType): Side {
  if (decision === 'BUY') return 'buy';
  if (decision === 'SELL') return 'sell';
  return 'neutral';
}

export const masterDecisionEngine: IntelligenceEngine<TradeDecision> & {
  analyze(context: DecisionEngineContext): EngineResult<TradeDecision>;
} = {
  name: ENGINE_NAME,
  version: ENGINE_VERSION,

  analyze(context: DecisionEngineContext): EngineResult<TradeDecision> {
    const startedAt = performance.now();
    const market = analyzeMarketIntelligence(context);
    const risk = riskIntelligenceEngine.analyze(context);
    const portfolio = portfolioIntelligenceEngine.analyze(context);
    const ml = context.ml ? mlIntelligenceEngine.analyze({ ...context, ...context.ml }) : undefined;
    const historical = context.historical
      ? historicalSimilarityEngine.analyze({ ...context, ...context.historical })
      : undefined;
    const knowledge = context.knowledge
      ? knowledgeIntelligenceEngine.analyze({ ...context, ...context.knowledge })
      : undefined;
const signals = market.strategy.result.signals;
    const scores = signalScore(signals);
    const evidence = directionalEvidence(signals);
    const dataQualityBlocked = market.dataQuality.status === 'failed' || market.dataQuality.result.freshnessStatus === 'stale';

    const deterministicDirection = scores.buy > scores.sell && scores.buy > 0
      ? 'buy' as const
      : scores.sell > scores.buy && scores.sell > 0
        ? 'sell' as const
        : 'neutral' as const;
    const mlDirection = ml?.result.prediction
      ? ml.result.prediction.prediction === 'up'
        ? 'buy' as const
        : ml.result.prediction.prediction === 'down'
          ? 'sell' as const
          : 'neutral' as const
      : undefined;

    // Dedicated Contradiction Engine (§23) — actively searches all layers for disagreement.
    const contradictionResult = contradictionEngine.analyze({
      ...context,
      market,
      decisionDirection: deterministicDirection,
      riskApproved: risk.result.approved,
      portfolioApproved: portfolio.result.approved,
      dataQualityBlocked,
      mlDirection,
      mlLineageComplete: ml?.result.lineageComplete,
      historicalSampleQuality: historical?.result.sampleQuality,
    });
    const contradictions = contradictionResult.result.contradictions.map((c) => c.detail);

    const hasDirectionalEvidence = scores.buy > 0 || scores.sell > 0;
    const hasHighContradiction = contradictionResult.result.blocksDecision;
    let decision: TradeDecisionType = 'NO_TRADE';

    if (!dataQualityBlocked && risk.result.approved && portfolio.result.approved && hasDirectionalEvidence && !hasHighContradiction) {
      decision = scores.buy > scores.sell ? 'BUY' : 'SELL';
    }

    const direction = directionForDecision(decision);
    const winningScore = direction === 'buy' ? scores.buy : direction === 'sell' ? scores.sell : 0;
    const opposingScore = direction === 'buy' ? scores.sell : direction === 'sell' ? scores.buy : 0;

    const optionalEvidence = [
      ...(ml?.evidence ?? []),
      ...(historical?.evidence ?? []),
      ...(knowledge?.evidence ?? []),
    ];
    const reasoning = aiReasoningEngine.analyze({
      ...context,
      evidence: [...evidence, ...optionalEvidence],
      contradictions,
    });

    // Dedicated Confidence Engine (§22) — multi-factor confidence that never overrides hard risk.
    const confidenceResult = confidenceEngine.analyze({
      ...context,
      market,
      evidence: [...evidence, ...optionalEvidence, ...contradictionResult.evidence],
      contradictions: contradictionResult.result.contradictions,
      riskApproved: risk.result.approved,
      portfolioApproved: portfolio.result.approved,
      dataQualityBlocked,
      decisionDirection: direction,
      historicalSampleQuality: historical?.result.sampleQuality,
      modelProbability: ml?.result.prediction?.probability,
      modelCalibrated: ml?.result.lineageComplete,
    });
    const confidence = confidenceResult.result.overall;

    const selectedStrategy = market.strategy.result.selectedStrategy.name;
    const explanation = decision === 'NO_TRADE'
      ? contradictions.length > 0
        ? `No trade: ${contradictions.join(' ')}`
        : 'No trade: insufficient directional evidence.'
      : `${decision} from ${selectedStrategy} evidence after risk, portfolio, and contradiction review.`;

    const latest = context.candles[context.candles.length - 1];
    const latestAtrPct = market.context.result.atrPct ?? 0.005;
    const entry = latest?.close;
    const entryZone = entry !== undefined
      ? { low: entry * (1 - latestAtrPct * 0.5), high: entry * (1 + latestAtrPct * 0.5) }
      : undefined;
    const invalidation = entry !== undefined
      ? direction === 'buy'
        ? entry * (1 - latestAtrPct * 1.5)
        : direction === 'sell'
          ? entry * (1 + latestAtrPct * 1.5)
          : undefined
      : undefined;
    const targets = entry !== undefined && direction !== 'neutral'
      ? [1, 2, 3].map((multiplier) => ({
          price: direction === 'buy'
            ? entry * (1 + latestAtrPct * 1.5 * multiplier)
            : entry * (1 - latestAtrPct * 1.5 * multiplier),
        }))
      : undefined;

    const engineVersions: Record<string, string> = {
      'master-decision': ENGINE_VERSION,
      'data-quality': market.dataQuality.engineVersion,
      'market-context': market.context.engineVersion,
      'market-structure': market.structure.engineVersion,
      'liquidity-intelligence': market.liquidity.engineVersion,
      'indicator-intelligence': market.indicators.engineVersion,
      'pattern-intelligence': market.patterns.engineVersion,
      'market-regime': market.regime.engineVersion,
      'strategy-intelligence': market.strategy.engineVersion,
      'risk-intelligence': risk.engineVersion,
      'portfolio-intelligence': portfolio.engineVersion,
      'contradiction': contradictionResult.engineVersion,
      'confidence': confidenceResult.engineVersion,
      'ai-reasoning': reasoning.engineVersion,
      ...(ml ? { 'ml-intelligence': ml.engineVersion } : {}),
      ...(historical ? { 'historical-similarity': historical.engineVersion } : {}),
      ...(knowledge ? { 'knowledge-intelligence': knowledge.engineVersion } : {}),
    };

    const result: TradeDecision = {
      decision,
      confidence,
      entry,
      entryZone,
      invalidation,
      targets,
      strategy: selectedStrategy,
      supportingEvidence: evidence,
      contradictions,
      reasoning: reasoning.result.summary,
      explanation,
      engineVersions,
      timestamp: new Date().toISOString(),
    };

    return {
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      timestamp: new Date().toISOString(),
      inputContextId: context.inputContextId,
      status: contradictionResult.status === 'failed' ? 'failed' : hasHighContradiction ? 'degraded' : 'ok',
      result,
      confidence,
      evidence: [
        ...evidence,
        ...market.context.evidence,
        ...market.indicators.evidence,
        ...market.liquidity.evidence,
        ...market.patterns.evidence,
        ...market.regime.evidence,
        ...contradictionResult.evidence,
        ...confidenceResult.evidence,
        ...optionalEvidence,
        ...reasoning.evidence,
        ...risk.evidence,
        ...portfolio.evidence,
      ],
      warnings: [
        ...market.dataQuality.warnings,
        ...market.context.warnings,
        ...market.indicators.warnings,
        ...market.liquidity.warnings,
        ...market.patterns.warnings,
        ...market.regime.warnings,
        ...contradictionResult.warnings,
        ...confidenceResult.warnings,
        ...(ml?.warnings ?? []),
        ...(historical?.warnings ?? []),
        ...(knowledge?.warnings ?? []),
        ...reasoning.warnings,
        ...market.structure.warnings,
        ...market.strategy.warnings,
      ],
      latencyMs: performance.now() - startedAt,
    };
  },
};
