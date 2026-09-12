import { atr, rsi } from '../indicators';
import { analyzeMarketStructure, type StructureState } from '../market-structure';
import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';

export interface MarketContextAnalysis {
  trendState: StructureState;
  volatilityState: 'high' | 'normal' | 'low' | 'unknown';
  momentumState: 'bullish' | 'bearish' | 'neutral' | 'unknown';
  sessionContext: 'asia' | 'europe' | 'us' | 'off-hours' | 'unknown';
  regimeCandidates: string[];
  latestPrice?: number;
  atr?: number;
  atrPct?: number;
  rsi?: number;
  contextVersion: string;
}

export interface MarketContextEngineContext extends EngineContext {
  thresholds?: {
    highAtrPct?: number;
    lowAtrPct?: number;
    bullishRsi?: number;
    bearishRsi?: number;
  };
}

const ENGINE_NAME = 'market-context';
const ENGINE_VERSION = '1.0.0';

function sessionFor(timestamp: number | undefined): MarketContextAnalysis['sessionContext'] {
  if (timestamp === undefined) return 'unknown';
  const hour = new Date(timestamp * 1000).getUTCHours();
  if (hour < 8) return 'asia';
  if (hour < 13) return 'europe';
  if (hour < 21) return 'us';
  return 'off-hours';
}

function evidenceFor(result: MarketContextAnalysis): EngineEvidence[] {
  return [
    {
      id: `${ENGINE_NAME}:trend`,
      kind: 'calculated',
      source: ENGINE_NAME,
      direction: result.trendState === 'bullish' ? 'bullish' : result.trendState === 'bearish' ? 'bearish' : 'neutral',
      score: result.atrPct,
      explanation: `Trend state is ${result.trendState}.`,
    },
    {
      id: `${ENGINE_NAME}:volatility`,
      kind: 'calculated',
      source: ENGINE_NAME,
      direction: 'neutral',
      score: result.atrPct,
      explanation: `Volatility state is ${result.volatilityState}.`,
    },
  ];
}

export const marketContextEngine: IntelligenceEngine<MarketContextAnalysis> & {
  analyze(context: MarketContextEngineContext): EngineResult<MarketContextAnalysis>;
} = {
  name: ENGINE_NAME,
  version: ENGINE_VERSION,

  analyze(context: MarketContextEngineContext): EngineResult<MarketContextAnalysis> {
    const startedAt = performance.now();
    const latest = context.candles[context.candles.length - 1];
    const structure = analyzeMarketStructure(context.candles);
    const atrValues = atr(context.candles, 14);
    const rsiValues = rsi(context.candles.map((candle) => candle.close), 14);
    const latestAtr = atrValues[atrValues.length - 1];
    const latestRsi = rsiValues[rsiValues.length - 1];
    const atrPct = latest && Number.isFinite(latestAtr) ? latestAtr / latest.close : undefined;
    const highAtrPct = context.thresholds?.highAtrPct ?? 0.02;
    const lowAtrPct = context.thresholds?.lowAtrPct ?? 0.005;
    const bullishRsi = context.thresholds?.bullishRsi ?? 55;
    const bearishRsi = context.thresholds?.bearishRsi ?? 45;
    const volatilityState = atrPct === undefined
      ? 'unknown'
      : atrPct >= highAtrPct ? 'high'
        : atrPct <= lowAtrPct ? 'low'
          : 'normal';
    const momentumState = !Number.isFinite(latestRsi)
      ? 'unknown'
      : latestRsi >= bullishRsi ? 'bullish'
        : latestRsi <= bearishRsi ? 'bearish'
          : 'neutral';
    const regimeCandidates: string[] = [structure.state];
    if (volatilityState === 'high') regimeCandidates.push('high-volatility');
    if (volatilityState === 'low') regimeCandidates.push('low-volatility');
    if (structure.lastBreakout) regimeCandidates.push('breakout');
    const result: MarketContextAnalysis = {
      trendState: structure.state,
      volatilityState,
      momentumState,
      sessionContext: sessionFor(latest?.time),
      regimeCandidates,
      latestPrice: latest?.close,
      atr: Number.isFinite(latestAtr) ? latestAtr : undefined,
      atrPct,
      rsi: Number.isFinite(latestRsi) ? latestRsi : undefined,
      contextVersion: ENGINE_VERSION,
    };

    return {
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      timestamp: new Date().toISOString(),
      inputContextId: context.inputContextId,
      status: context.candles.length < 20 ? 'degraded' : 'ok',
      result,
      confidence: context.candles.length < 20 ? 0.25 : 0.75,
      evidence: evidenceFor(result),
      warnings: context.candles.length < 20 ? ['At least 20 candles are recommended for context indicators.'] : [],
      latencyMs: performance.now() - startedAt,
    };
  },
};