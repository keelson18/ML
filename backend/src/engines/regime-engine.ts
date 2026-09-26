import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';
import { marketContextEngine, type MarketContextAnalysis } from './market-context-engine';

export type MarketRegime = 'trending' | 'ranging' | 'high-volatility' | 'low-volatility' | 'breakout' | 'transition' | 'uncertain';

export interface RegimeAnalysis {
  regime: MarketRegime;
  confidence: number;
  reasons: string[];
  detectorVersion: string;
}

export interface RegimeEngineContext extends EngineContext {
  marketContext?: EngineResult<MarketContextAnalysis>;
}

const ENGINE_NAME = 'market-regime';
const ENGINE_VERSION = '1.0.0';

function classify(context: MarketContextAnalysis): RegimeAnalysis {
  const reasons: string[] = [];
  if (context.regimeCandidates.includes('breakout')) {
    reasons.push('A market-structure breakout was detected.');
    return { regime: 'breakout', confidence: 0.75, reasons, detectorVersion: ENGINE_VERSION };
  }
  if (context.volatilityState === 'high') {
    reasons.push('ATR percentage is above the configured high-volatility threshold.');
    return { regime: 'high-volatility', confidence: 0.7, reasons, detectorVersion: ENGINE_VERSION };
  }
  if (context.volatilityState === 'low') {
    reasons.push('ATR percentage is below the configured low-volatility threshold.');
    return { regime: 'low-volatility', confidence: 0.7, reasons, detectorVersion: ENGINE_VERSION };
  }
  if (context.trendState === 'bullish' || context.trendState === 'bearish') {
    reasons.push(`Structure is ${context.trendState} with measurable trend strength.`);
    return { regime: 'trending', confidence: 0.7, reasons, detectorVersion: ENGINE_VERSION };
  }
  if (context.trendState === 'ranging' || context.trendState === 'consolidating') {
    reasons.push(`Structure is ${context.trendState}.`);
    return { regime: 'ranging', confidence: 0.65, reasons, detectorVersion: ENGINE_VERSION };
  }
  reasons.push('Available context does not support a stable regime classification.');
  return { regime: 'uncertain', confidence: 0.2, reasons, detectorVersion: ENGINE_VERSION };
}

export const marketRegimeEngine: IntelligenceEngine<RegimeAnalysis> & {
  analyze(context: RegimeEngineContext): EngineResult<RegimeAnalysis>;
} = {
  name: ENGINE_NAME,
  version: ENGINE_VERSION,

  analyze(context: RegimeEngineContext): EngineResult<RegimeAnalysis> {
    const startedAt = performance.now();
    const marketContext = context.marketContext ?? marketContextEngine.analyze(context);
    const result = classify(marketContext.result);
    const evidence: EngineEvidence[] = result.reasons.map((reason, index) => ({
      id: `${ENGINE_NAME}:reason:${index}`,
      kind: 'calculated',
      source: ENGINE_NAME,
      direction: 'neutral',
      score: result.confidence,
      explanation: reason,
    }));

    return {
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      timestamp: new Date().toISOString(),
      inputContextId: context.inputContextId,
      status: marketContext.status === 'failed' ? 'failed' : result.regime === 'uncertain' ? 'degraded' : 'ok',
      result,
      confidence: result.confidence,
      evidence,
      warnings: marketContext.warnings,
      latencyMs: performance.now() - startedAt,
    };
  },
};