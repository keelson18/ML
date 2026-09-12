import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';
import type { MarketIntelligenceSnapshot } from './orchestrator';

/**
 * Contradiction Engine (AI Engine Specification §23)
 *
 * The system should ACTIVELY search for disagreement between independent
 * evidence sources and contextual layers. Contradictions reduce decision
 * confidence and can trigger NO_TRADE.
 *
 * Examples:
 *   - Higher timeframe bullish vs. lower timeframe structure bearish
 *   - Strategy historically strong but current volatility unsuitable
 *   - Regime mismatch with the selected strategy
 *   - ML prediction conflicting with deterministic direction
 */

export type ContradictionSeverity = 'low' | 'medium' | 'high';

export interface Contradiction {
  severity: ContradictionSeverity;
  detail: string;
  involvedSources: string[];
}

export interface ContradictionAnalysis {
  contradictions: Contradiction[];
  count: number;
  maxSeverity: ContradictionSeverity | 'none';
  blocksDecision: boolean;
}

export interface ContradictionEngineContext extends EngineContext {
  market: MarketIntelligenceSnapshot;
  decisionDirection: 'buy' | 'sell' | 'neutral';
  riskApproved: boolean;
  portfolioApproved: boolean;
  dataQualityBlocked: boolean;
  mlDirection?: 'buy' | 'sell' | 'neutral';
  mlLineageComplete?: boolean;
  historicalSampleQuality?: 'high' | 'medium' | 'low' | 'none';
}

const ENGINE_NAME = 'contradiction';
const ENGINE_VERSION = '1.0.0';

function severityFor(severity: ContradictionSeverity): number {
  return severity === 'high' ? 3 : severity === 'medium' ? 2 : 1;
}

function maxSeverityOf(contradictions: Contradiction[]): ContradictionAnalysis['maxSeverity'] {
  if (contradictions.length === 0) return 'none';
  let max: ContradictionSeverity = 'low';
  for (const c of contradictions) {
    if (severityFor(c.severity) > severityFor(max)) max = c.severity;
  }
  return max;
}

export const contradictionEngine: IntelligenceEngine<ContradictionAnalysis> & {
  analyze(context: ContradictionEngineContext): EngineResult<ContradictionAnalysis>;
} = {
  name: ENGINE_NAME,
  version: ENGINE_VERSION,

  analyze(context: ContradictionEngineContext): EngineResult<ContradictionAnalysis> {
    const startedAt = performance.now();
    const contradictions: Contradiction[] = [];
    const market = context.market;

    // Risk / portfolio gate rejection is a hard contradiction.
    if (!context.riskApproved) {
      contradictions.push({
        severity: 'high',
        detail: 'Risk intelligence rejected the proposal.',
        involvedSources: ['risk-intelligence'],
      });
    }
    if (!context.portfolioApproved) {
      contradictions.push({
        severity: 'high',
        detail: 'Portfolio intelligence rejected the proposal.',
        involvedSources: ['portfolio-intelligence'],
      });
    }
    if (context.dataQualityBlocked) {
      contradictions.push({
        severity: 'high',
        detail: 'Data quality is blocked; downstream intelligence cannot be trusted.',
        involvedSources: ['data-quality'],
      });
    }

    // Conflicting directional signals within deterministic evidence.
    const signals = market.strategy.result.signals;
    const buyStrong = signals.some((s) => s.side === 'buy' && s.confidence >= 0.5);
    const sellStrong = signals.some((s) => s.side === 'sell' && s.confidence >= 0.5);
    if (buyStrong && sellStrong) {
      contradictions.push({
        severity: 'high',
        detail: 'Bullish and bearish strategy evidence are both present with meaningful confidence.',
        involvedSources: ['strategy-intelligence'],
      });
    }

    // ML prediction conflicting with the deterministic direction.
    if (
      context.mlDirection !== undefined &&
      context.mlDirection !== 'neutral' &&
      context.mlLineageComplete === true &&
      context.decisionDirection !== 'neutral' &&
      context.decisionDirection !== context.mlDirection
    ) {
      contradictions.push({
        severity: 'medium',
        detail: `ML prediction (${context.mlDirection}) conflicts with the deterministic direction (${context.decisionDirection}).`,
        involvedSources: ['ml-intelligence', 'strategy-intelligence'],
      });
    }

    // Regime vs. strategy suitability is evaluated by the strategy engine state.
    const regime = market.regime.result.regime;
    if (regime === 'uncertain' || regime === 'transition') {
      contradictions.push({
        severity: 'medium',
        detail: `The market regime is ${regime}; strategy selection confidence is reduced.`,
        involvedSources: ['market-regime'],
      });
    }

    // Trend/context conflict with the decision direction.
    const trendState = market.context.result.trendState;
    const momentumState = market.context.result.momentumState;
    if (context.decisionDirection === 'buy' && (trendState === 'bearish' || momentumState === 'bearish')) {
      contradictions.push({
        severity: 'medium',
        detail: 'A buy decision conflicts with bearish trend or momentum context.',
        involvedSources: ['market-context'],
      });
    }
    if (context.decisionDirection === 'sell' && (trendState === 'bullish' || momentumState === 'bullish')) {
      contradictions.push({
        severity: 'medium',
        detail: 'A sell decision conflicts with bullish trend or momentum context.',
        involvedSources: ['market-context'],
      });
    }

    // Volatility unsuitable for the selected strategy remains a soft warning unless the regime flags it.
    if (market.context.result.volatilityState === 'high' && regime === 'ranging') {
      contradictions.push({
        severity: 'low',
        detail: 'High volatility combined with a ranging regime reduces the reliability of range-based setups.',
        involvedSources: ['market-context', 'market-regime'],
      });
    }

    // Small / low-quality historical samples are not treated as strong evidence.
    const sampleQuality = context.historicalSampleQuality ?? 'none';
    if (sampleQuality === 'low' || sampleQuality === 'none') {
      contradictions.push({
        severity: 'low',
        detail: `Historical sample quality is ${sampleQuality}; historical evidence is not strong.`,
        involvedSources: ['historical-similarity'],
      });
    }

    const count = contradictions.length;
    const maxSeverity = maxSeverityOf(contradictions);
    const blocksDecision = maxSeverity === 'high';

    const result: ContradictionAnalysis = {
      contradictions,
      count,
      maxSeverity,
      blocksDecision,
    };

    const evidence: EngineEvidence[] = contradictions.map((c, index) => ({
      id: `${ENGINE_NAME}:${index}:${c.detail.slice(0, 24)}`,
      kind: 'inferred',
      source: ENGINE_NAME,
      direction: 'neutral',
      score: severityFor(c.severity) / 3,
      explanation: c.detail,
    }));

    return {
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      timestamp: new Date().toISOString(),
      inputContextId: context.inputContextId,
      status: blocksDecision ? 'degraded' : 'ok',
      result,
      confidence: blocksDecision ? 0 : maxSeverity === 'medium' ? 0.4 : maxSeverity === 'low' ? 0.8 : 1,
      evidence,
      warnings: blocksDecision
        ? ['High-severity contradictions were detected; the decision should be blocked or forced to NO_TRADE.']
        : [],
      latencyMs: performance.now() - startedAt,
    };
  },
};
