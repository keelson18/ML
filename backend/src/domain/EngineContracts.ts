/**
 * Intelligence Engine Contracts
 * Abstract interfaces for all 20 specialized engines
 * Per: GreenHill_AI_Engine_Specification_v1.0.md
 */

import type { Candle, CandleSequence } from '../domain/MarketData';
import type { Asset } from '../domain/Asset';
import type { TradeDecision } from '../domain/TradeDecision';

/**
 * 1. Data Quality Engine
 */
export interface DataQualityResult {
  isValid: boolean;
  qualityScore: number; // 0..1
  freshness: 'fresh' | 'stale' | 'expired';
  anomalies: string[];
  warnings: string[];
}

export interface IDataQualityEngine {
  validate(candles: CandleSequence, asset: Asset): Promise<DataQualityResult>;
}

/**
 * 2. Market Context Engine
 */
export interface MarketContextSnapshot {
  timestamp: Date;
  asset: string;
  timeframe: string;
  trendState: 'uptrend' | 'downtrend' | 'ranging' | 'uncertain';
  volatilityState: 'low' | 'normal' | 'high' | 'extreme';
  momentumState: 'strong_up' | 'weak_up' | 'neutral' | 'weak_down' | 'strong_down';
  sessionContext?: string;
  regimeCandidates: Array<{ name: string; confidence: number }>;
  version: string;
}

export interface IMarketContextEngine {
  analyze(candles: CandleSequence, asset: Asset, timeframe: string): Promise<MarketContextSnapshot>;
}

/**
 * 3. Market Structure Engine
 */
export interface StructureContext {
  direction: 'up' | 'down' | 'undefined';
  levels: Array<{ type: 'support' | 'resistance'; price: number; strength: number }>;
  events: Array<{ type: string; timestamp: Date; price: number }>;
  confidence: number;
  invalidation?: { price: number; description: string };
  version: string;
}

export interface IMarketStructureEngine {
  detect(candles: CandleSequence, asset: Asset): Promise<StructureContext>;
}

/**
 * 4. Liquidity Intelligence Engine
 */
export interface LiquidityContext {
  zones: Array<{ price: number; strength: number; type: 'pool' | 'cluster' }>;
  sweepCandidates: Array<{ price: number; probability: number }>;
  rejectionZones: number[];
  displacement: { direction: 'up' | 'down'; magnitude: number };
  confidence: number;
  version: string;
}

export interface ILiquidityEngine {
  analyze(candles: CandleSequence, asset: Asset): Promise<LiquidityContext>;
}

/**
 * 5. Pattern Intelligence Engine
 */
export interface PatternDetection {
  patterns: Array<{
    name: string;
    type: 'candlestick' | 'chart' | 'continuation' | 'reversal';
    confidence: number;
    location: { startCandle: number; endCandle: number };
    implication: 'bullish' | 'bearish' | 'neutral';
  }>;
  version: string;
}

export interface IPatternEngine {
  detect(candles: CandleSequence, asset: Asset): Promise<PatternDetection>;
}

/**
 * 6. Indicator Intelligence Engine
 */
export interface IndicatorValue {
  name: string;
  value: number;
  signal?: number;
  normalized?: number;
  trend?: 'increasing' | 'decreasing' | 'flat';
  timestamp: Date;
}

export interface IIndicatorEngine {
  calculate(candles: CandleSequence, asset: Asset, indicators: string[]): Promise<IndicatorValue[]>;
}

/**
 * 7. Market Regime Engine
 */
export interface RegimeClassification {
  regime: 'trending' | 'ranging' | 'breakout' | 'volatile' | 'transition' | 'risk_off' | 'uncertain';
  confidence: number;
  direction?: 'up' | 'down';
  startTime: Date;
  endTime?: Date;
  version: string;
}

export interface IRegimeEngine {
  classify(candles: CandleSequence, asset: Asset): Promise<RegimeClassification>;
}

/**
 * 8. Strategy Intelligence Engine
 */
export interface StrategyCandidate {
  strategyId: string;
  strategyVersion: string;
  suitabilityScore: number; // 0..1
  supportingEvidence: string[];
  conflictingEvidence: string[];
  historicalContext?: { similarCases: number; winRate: number };
  invalidation?: string;
}

export interface IStrategyEngine {
  rankStrategies(
    context: MarketContextSnapshot,
    structure: StructureContext,
    asset: Asset,
  ): Promise<StrategyCandidate[]>;
}

/**
 * 9. Historical Similarity Engine
 */
export interface SimilarCase {
  caseId: string;
  similarity: number; // 0..1
  outcomes: Array<{ side: string; result: 'win' | 'loss'; pnl: number }>;
  sampleQuality: number;
  timeframe: string;
  description: string;
}

export interface IHistoricalEngine {
  findSimilar(
    context: MarketContextSnapshot,
    structure: StructureContext,
    limit?: number,
  ): Promise<SimilarCase[]>;
}

/**
 * 10. Knowledge Intelligence Engine
 */
export interface KnowledgeRetrievalResult {
  items: Array<{
    id: string;
    type: string;
    content: string;
    confidence: number;
    source: string;
  }>;
  relationshipGraph?: Record<string, string[]>;
  version: string;
}

export interface IKnowledgeEngine {
  retrieve(asset: string, regime: string, pattern?: string): Promise<KnowledgeRetrievalResult>;
}

/**
 * 11. ML Intelligence Engine
 */
export interface MLPredictionResult {
  prediction: string;
  probability: number;
  confidence: 'low' | 'medium' | 'high';
  modelVersion: string;
  features: Record<string, number>;
  calibration?: number;
  timestamp: Date;
}

export interface IMLEngine {
  predict(asset: string, features: Record<string, number>): Promise<MLPredictionResult>;
}

/**
 * 12. AI Reasoning Engine
 */
export interface AIReasoningResult {
  synthesis: string;
  confidence: number;
  supportedHypotheses: string[];
  contradictions: string[];
  nextSteps: string[];
  version: string;
}

export interface IAIReasoningEngine {
  reason(evidence: Record<string, unknown>, question: string): Promise<AIReasoningResult>;
}

/**
 * 13. Risk Intelligence Engine
 */
export interface RiskCheckResult {
  approved: boolean;
  rejected: boolean;
  riskScore: number; // 0..1
  violatedRules: string[];
  requiredAdjustments?: Record<string, unknown>;
  version: string;
}

export interface IRiskEngine {
  evaluate(
    decision: TradeDecision,
    portfolio: Record<string, unknown>,
  ): Promise<RiskCheckResult>;
}

/**
 * 14. Portfolio Intelligence Engine
 */
export interface PortfolioContext {
  totalExposure: number;
  correlation: number;
  concentration: number;
  diversification: number;
  portfolioRisk: number;
  portfolioVolatility: number;
  maxDrawdown: number;
  scenarioImpact?: Record<string, number>;
  version: string;
}

export interface IPortfolioEngine {
  analyze(portfolio: Record<string, unknown>, asset: string): Promise<PortfolioContext>;
}

/**
 * 15. Master Decision Engine
 */
export interface DecisionInput {
  asset: Asset;
  timeframe: string;
  marketContext: MarketContextSnapshot;
  structure: StructureContext;
  liquidity: LiquidityContext;
  patterns: PatternDetection;
  indicators: IndicatorValue[];
  regime: RegimeClassification;
  strategyCandidates: StrategyCandidate[];
  historicalCases?: SimilarCase[];
  knowledge?: KnowledgeRetrievalResult;
  mlEvidence?: MLPredictionResult;
  aiReasoning?: AIReasoningResult;
  riskContext: Record<string, unknown>;
  portfolioContext: PortfolioContext;
  correlationId: string;
}

export interface IMasterDecisionEngine {
  generateDecision(input: DecisionInput): Promise<TradeDecision>;
}

/**
 * 16. Confidence Engine (§22 - Per spec)
 */
export interface ConfidenceFactors {
  evidenceStrength: number;
  contradictionPressure: number;
  historicalReliability: number;
  modelCalibration: number;
  marketConditionAlignment: number;
  riskAdjustment: number;
}

export interface IConfidenceEngine {
  calculate(factors: ConfidenceFactors): Promise<number>;
}

/**
 * 17. Contradiction Engine (§23 - Per spec)
 */
export interface ContradictionAnalysis {
  contradictions: Array<{ type: string; severity: number; description: string }>;
  overallContradictionPressure: number;
  resolutionSuggestions: string[];
}

export interface IContradictionEngine {
  analyze(evidence: Record<string, unknown>): Promise<ContradictionAnalysis>;
}

/**
 * 18. Explainability Engine
 */
export interface ExplainabilityOutput {
  whatHappened: string;
  whyDecision: string;
  supportingFactors: string[];
  conflictingFactors: string[];
  engineContributions: Record<string, number>;
  alternativesRejected: string[];
  invalidationConditions: string[];
  risks: string[];
  versioning: {
    decisionEngine: string;
    strategies: string[];
    models: string[];
  };
}

export interface IExplainabilityEngine {
  explain(decision: TradeDecision): Promise<ExplainabilityOutput>;
}

/**
 * 19. Trade Review Engine
 */
export interface TradeReviewResult {
  thesisQuality: 'correct' | 'incorrect' | 'partially_correct';
  executionQuality: 'excellent' | 'good' | 'acceptable' | 'poor';
  riskQuality: 'well_managed' | 'acceptable' | 'concerning';
  marketRegimeContext: string;
  outcomeClass:
    | 'correct_thesis_good_execution'
    | 'correct_thesis_poor_execution'
    | 'incorrect_thesis'
    | 'risk_failure'
    | 'data_failure'
    | 'strategy_mismatch'
    | 'uncertain';
  lessons: string[];
  version: string;
}

export interface ITradeReviewEngine {
  review(
    decision: TradeDecision,
    outcome: { entryPrice: number; exitPrice: number; side: string },
  ): Promise<TradeReviewResult>;
}

/**
 * 20. Learning Intelligence Engine
 */
export interface LearningOutcome {
  approved: boolean;
  hypothesis: string;
  validationResults: Record<string, unknown>;
  knowledgeUpdate?: Record<string, unknown>;
  modelUpdate?: Record<string, unknown>;
  version: string;
}

export interface ILearningEngine {
  processObservation(
    observation: Record<string, unknown>,
    hypothesis?: string,
  ): Promise<LearningOutcome>;
}
