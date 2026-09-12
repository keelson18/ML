import type { MarketStructure } from '../market-structure';
import type { EngineContext, EngineResult } from './contracts';
import { dataQualityEngine, type DataQualityAnalysis } from './data-quality-engine';
import { marketContextEngine, type MarketContextAnalysis } from './market-context-engine';
import { indicatorIntelligenceEngine, type IndicatorAnalysis } from './indicator-engine';
import { liquidityIntelligenceEngine, type LiquidityAnalysis } from './liquidity-engine';
import { marketStructureEngine } from './market-structure-engine';
import { marketRegimeEngine, type RegimeAnalysis } from './regime-engine';
import { patternIntelligenceEngine, type PatternAnalysis } from './pattern-engine';
import { strategyIntelligenceEngine, type StrategyAnalysis } from './strategy-engine';

export interface MarketIntelligenceSnapshot {
  dataQuality: EngineResult<DataQualityAnalysis>;
  context: EngineResult<MarketContextAnalysis>;
  indicators: EngineResult<IndicatorAnalysis>;
  liquidity: EngineResult<LiquidityAnalysis>;
  patterns: EngineResult<PatternAnalysis>;
  regime: EngineResult<RegimeAnalysis>;
  structure: EngineResult<MarketStructure>;
  strategy: EngineResult<StrategyAnalysis>;
}

export function analyzeMarketIntelligence(context: EngineContext): MarketIntelligenceSnapshot {
  const marketContext = marketContextEngine.analyze(context);
  return {
    dataQuality: dataQualityEngine.analyze(context),
    context: marketContext,
    indicators: indicatorIntelligenceEngine.analyze(context),
    liquidity: liquidityIntelligenceEngine.analyze(context),
    patterns: patternIntelligenceEngine.analyze(context),
    regime: marketRegimeEngine.analyze({ ...context, marketContext }),
    structure: marketStructureEngine.analyze(context),
    strategy: strategyIntelligenceEngine.analyze(context),
  };
}