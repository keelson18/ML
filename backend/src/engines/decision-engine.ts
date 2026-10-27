import type { Side, Signal } from '../../../src/lib/types';
import { aiReasoningEngine } from './ai-reasoning-engine';
import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';
import { analyzeMarketIntelligence } from './orchestrator';
import { contradictionEngine } from './contradiction-engine';
import { confidenceEngine, type ConfidenceFactor } from './confidence-engine';
import { historicalSimilarityEngine, type HistoricalCase } from './historical-similarity-engine';
import { knowledgeIntelligenceEngine, type KnowledgeNode } from './knowledge-engine';
import { mlIntelligenceEngine, type MLPredictionAnalysis } from './ml-engine';
import { portfolioIntelligenceEngine, type PortfolioEngineContext } from './portfolio-engine';
import { riskIntelligenceEngine, type RiskEngineContext } from './risk-engine';

export type TradeDecisionType = 'BUY' | 'SELL' | 'HOLD' | 'WATCH' | 'NO_TRADE';

export interface DecisionEngineContext extends EngineContext {
  entryZone?: { low: number; high: number };
  risk: RiskEngineContext['risk'];
  portfolio: PortfolioEngineContext['portfolio'];
  ml?: {
    prediction?: MLPredictionAnalysis['prediction'];
    featureSnapshot?: Record<string, number>;
    datasetId?: string;
    calibration?: {
      modelVersion: string;
      timeframe: string;
      sampleCount: number;
      brierScore: number;
      measuredAt: string;
    };
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
  marketBias: Side;
  stages: {
    setupDetection: { status: 'not_evaluated'; reason: string };
    entryConfirmation: { status: 'not_confirmed'; reason: string };
    riskApproval: { status: 'approved' | 'rejected'; reasons: string[] };
    finalDecision: { action: 'NO_TRADE'; reason: string };
  };
  confidence: number;
  confidenceBreakdown?: {
    factors: ConfidenceFactor[];
    contradictionPenalty: number;
    riskBlocked: boolean;
    dataQualityBlocked: boolean;
  };
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
      correlationGroup: 'ohlcv-derived-strategy-signals',
      direction: signal.side === 'buy' ? 'bullish' : 'bearish',
      score: signal.confidence,
      explanation: signal.reason,
    }));
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
    const selectedStrategy = market.strategy.result.selectedStrategy;
    const selectedSignals = signals.filter((signal) => signal.strategyId === selectedStrategy.id);
    const selectedScores = signalScore(selectedSignals);
    const biasScores = signalScore(signals);
    const evidence = directionalEvidence(signals);
    const dataQualityBlocked = market.dataQuality.status !== 'ok'
      || market.dataQuality.result.freshnessStatus !== 'fresh'
      || market.dataQuality.result.candleClosure !== 'verified_closed'
      || market.dataQuality.result.dataState !== 'ready'
      || !market.dataQuality.result.source;
    const strategyExecutionBlocked = market.strategy.result.executionFailures.length > 0;

    const deterministicDirection = biasScores.buy > biasScores.sell && biasScores.buy > 0
      ? 'buy' as const
      : biasScores.sell > biasScores.buy && biasScores.sell > 0
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
    // Preserve the specific reasons from hard gates. Generic gate messages alone
    // are not sufficient for an auditable decision or a useful explanation.
    const contradictions = [...new Set([
      ...contradictionResult.result.contradictions.map((contradiction) => contradiction.detail),
      ...risk.result.violatedRules,
      ...portfolio.result.violatedRules,
      ...(dataQualityBlocked ? market.dataQuality.result.anomalies : []),
      ...(strategyExecutionBlocked ? market.strategy.result.executionFailures.map((failure) => `${failure.strategy} (${failure.strategyId}) failed: ${failure.message}`) : []),
    ])];

    const hasDirectionalEvidence = selectedScores.buy > 0 || selectedScores.sell > 0;
    const hasHighContradiction = contradictionResult.result.blocksDecision;
    // A strategy signal establishes directional bias only. TradePlan detection and a
    // closed-candle trigger are separate planner/executor responsibilities; this API
    // cannot turn a directional vote directly into an entry decision.
    const decision: TradeDecisionType = 'NO_TRADE';
    const direction = deterministicDirection;
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
      modelCalibrated: ml?.result.calibrated,
    });
    const confidence = confidenceResult.result.overall;

    const strategyName = selectedStrategy.name;
    const riskApprovalReasons = [...new Set([...risk.result.violatedRules, ...portfolio.result.violatedRules])];
    const setupReason = 'Directional strategy output is market bias only; a separately validated TradePlan is required.';
    const confirmationReason = 'No executor-confirmed trigger on a verified closed candle was supplied to decision analysis.';
    const finalReason = hasDirectionalEvidence
      ? 'No trade: setup detection and closed-candle entry confirmation are separate required stages.'
      : `No trade: selected strategy ${strategyName} has no directional bias signal.`;
    const explanation = `${finalReason}${contradictions.length ? ` ${contradictions.join(' ')}` : ''}`;

    // The risk gate and the published trade levels must refer to the same proposal.
    // Analysis cannot invent ATR-based stops, targets, or entry zones when no plan exists.

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
      marketBias: deterministicDirection,
      stages: {
        setupDetection: { status: 'not_evaluated', reason: setupReason },
        entryConfirmation: { status: 'not_confirmed', reason: confirmationReason },
        riskApproval: {
          status: risk.result.approved && portfolio.result.approved && !dataQualityBlocked && !strategyExecutionBlocked && !hasHighContradiction ? 'approved' : 'rejected',
          reasons: riskApprovalReasons.length ? riskApprovalReasons : contradictions,
        },
        finalDecision: { action: 'NO_TRADE', reason: finalReason },
      },
      confidence,
      confidenceBreakdown: {
        factors: confidenceResult.result.factors,
        contradictionPenalty: confidenceResult.result.contradictionPenalty,
        riskBlocked: confidenceResult.result.riskBlocked,
        dataQualityBlocked: confidenceResult.result.dataQualityBlocked,
      },
      entry: undefined,
      entryZone: undefined,
      invalidation: undefined,
      targets: undefined,
      strategy: strategyName,
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
      status: contradictionResult.status === 'failed' ? 'failed' : hasHighContradiction || dataQualityBlocked || strategyExecutionBlocked ? 'degraded' : 'ok',
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
