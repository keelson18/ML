import {
  detectFVGs,
  detectLiquiditySweeps,
  detectLiquidityZones,
  detectOrderBlocks,
  type FVG,
  type LiquidityZone,
  type OrderBlock,
} from '../smc';
import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';

export interface LiquidityAnalysis {
  zones: LiquidityZone[];
  sweeps: LiquidityZone[];
  orderBlocks: OrderBlock[];
  fairValueGaps: FVG[];
  observedCount: number;
  inferredCount: number;
}

const ENGINE_NAME = 'liquidity-intelligence';
const ENGINE_VERSION = '1.0.0';

function evidenceFor(result: LiquidityAnalysis): EngineEvidence[] {
  const zoneEvidence: EngineEvidence[] = result.zones.slice(-10).map((zone, index) => ({
    id: `${ENGINE_NAME}:zone:${index}`,
    kind: 'calculated',
    source: ENGINE_NAME,
    direction: 'neutral',
    score: zone.strength,
    explanation: `${zone.type} liquidity near ${zone.price.toFixed(4)}${zone.swept ? ' (swept)' : ''}.`,
  }));
  const sweepEvidence: EngineEvidence[] = result.sweeps.map((sweep, index) => ({
    id: `${ENGINE_NAME}:sweep:${index}`,
    kind: 'inferred',
    source: ENGINE_NAME,
    direction: 'neutral',
    score: sweep.strength,
    explanation: `Potential liquidity sweep at ${sweep.price.toFixed(4)}.`,
  }));
  return [...zoneEvidence, ...sweepEvidence];
}

export const liquidityIntelligenceEngine: IntelligenceEngine<LiquidityAnalysis> & {
  analyze(context: EngineContext): EngineResult<LiquidityAnalysis>;
} = {
  name: ENGINE_NAME,
  version: ENGINE_VERSION,

  analyze(context: EngineContext): EngineResult<LiquidityAnalysis> {
    const startedAt = performance.now();
    const zones = detectLiquidityZones(context.candles);
    const sweeps = detectLiquiditySweeps(context.candles);
    const orderBlocks = detectOrderBlocks(context.candles);
    const fairValueGaps = detectFVGs(context.candles);
    const result: LiquidityAnalysis = {
      zones,
      sweeps,
      orderBlocks,
      fairValueGaps,
      observedCount: zones.length + orderBlocks.length + fairValueGaps.length,
      inferredCount: sweeps.length,
    };
    const warnings = context.candles.length < 10
      ? ['At least 10 candles are recommended for liquidity analysis.']
      : [];

    return {
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      timestamp: new Date().toISOString(),
      inputContextId: context.inputContextId,
      status: context.candles.length < 10 ? 'degraded' : 'ok',
      result,
      confidence: result.observedCount > 0 ? 0.7 : 0.2,
      evidence: evidenceFor(result),
      warnings,
      latencyMs: performance.now() - startedAt,
    };
  },
};