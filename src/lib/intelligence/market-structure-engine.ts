import { analyzeMarketStructure, type MarketStructure } from '../market-structure';
import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';

const ENGINE_NAME = 'market-structure';
const ENGINE_VERSION = '1.0.0';

function buildEvidence(structure: MarketStructure): EngineEvidence[] {
  return structure.events.slice(-10).map((event, index) => ({
    id: `${ENGINE_NAME}:${event.type}:${event.time}:${index}`,
    kind: 'calculated',
    source: ENGINE_NAME,
    direction: event.type === 'HH' || event.type === 'HL' || event.type === 'BOS' && structure.state === 'bullish'
      ? 'bullish'
      : event.type === 'LH' || event.type === 'LL' || event.type === 'BOS' && structure.state === 'bearish'
        ? 'bearish'
        : 'neutral',
    score: event.strength,
    explanation: event.description,
  }));
}

export const marketStructureEngine: IntelligenceEngine<MarketStructure> = {
  name: ENGINE_NAME,
  version: ENGINE_VERSION,

  analyze(context: EngineContext): EngineResult<MarketStructure> {
    const startedAt = performance.now();
    const structure = analyzeMarketStructure(context.candles);
    const warnings: string[] = [];

    if (context.candles.length < 50) {
      warnings.push('At least 50 candles are required for a full structure analysis.');
    }
    if (structure.events.length === 0) {
      warnings.push('No structural events were detected in the available candles.');
    }

    const status = context.candles.length < 50 ? 'degraded' : 'ok';
    return {
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      timestamp: new Date().toISOString(),
      inputContextId: context.inputContextId,
      status,
      result: structure,
      confidence: structure.events.length > 0 ? structure.trendStrength : 0,
      evidence: buildEvidence(structure),
      warnings,
      latencyMs: performance.now() - startedAt,
    };
  },
};