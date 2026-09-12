import { detectCandlestickPatterns } from '../patterns/candlestick-patterns';
import { detectExtendedChartPatterns } from '../patterns/chart-patterns';
import { detectTrend, scorePattern, type ScoredPattern } from '../patterns/scoring';
import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';

export interface PatternAnalysis {
  patterns: ScoredPattern[];
  candlestickCount: number;
  chartPatternCount: number;
}

const ENGINE_NAME = 'pattern-intelligence';
const ENGINE_VERSION = '1.0.0';

function evidenceFor(patterns: ScoredPattern[]): EngineEvidence[] {
  return patterns.map((pattern, index) => ({
    id: `${ENGINE_NAME}:${pattern.strategy}:${index}`,
    kind: 'calculated',
    source: pattern.strategy,
    direction: pattern.side === 'buy' ? 'bullish' : pattern.side === 'sell' ? 'bearish' : 'neutral',
    score: pattern.score,
    explanation: pattern.reason,
  }));
}

export const patternIntelligenceEngine: IntelligenceEngine<PatternAnalysis> & {
  analyze(context: EngineContext): EngineResult<PatternAnalysis>;
} = {
  name: ENGINE_NAME,
  version: ENGINE_VERSION,

  analyze(context: EngineContext): EngineResult<PatternAnalysis> {
    const startedAt = performance.now();
    const candlestickPatterns = detectCandlestickPatterns(context.candles);
    const chartPatterns = detectExtendedChartPatterns(context.candles);
    const trend = detectTrend(context.candles);
    const patterns = [...candlestickPatterns, ...chartPatterns]
      .map((pattern) => scorePattern(pattern, context.candles, trend))
      .sort((left, right) => right.score - left.score);
    const result: PatternAnalysis = {
      patterns,
      candlestickCount: candlestickPatterns.length,
      chartPatternCount: chartPatterns.length,
    };
    const warnings = context.candles.length < 20
      ? ['At least 20 candles are recommended for context-aware pattern scoring.']
      : [];

    return {
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      timestamp: new Date().toISOString(),
      inputContextId: context.inputContextId,
      status: context.candles.length < 20 ? 'degraded' : 'ok',
      result,
      confidence: patterns.length > 0 ? patterns[0].score : 0,
      evidence: evidenceFor(patterns),
      warnings,
      latencyMs: performance.now() - startedAt,
    };
  },
};