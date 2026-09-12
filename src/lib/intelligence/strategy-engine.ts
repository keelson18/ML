import { runAllStrategies, selectBestStrategy, type Strategy } from '../strategies/index';
import type { Signal } from '../types';
import type { EngineContext, EngineEvidence, EngineResult, IntelligenceEngine } from './contracts';

export interface StrategyAnalysis {
  selectedStrategy: Pick<Strategy, 'name' | 'type' | 'timeframes' | 'minCandles'>;
  signals: Signal[];
}

const ENGINE_NAME = 'strategy-intelligence';
const ENGINE_VERSION = '1.0.0';

function signalDirection(signal: Signal): EngineEvidence['direction'] {
  if (signal.side === 'buy') return 'bullish';
  if (signal.side === 'sell') return 'bearish';
  return 'neutral';
}

function buildEvidence(signals: Signal[]): EngineEvidence[] {
  return signals.map((signal, index) => ({
    id: `${ENGINE_NAME}:${signal.strategy}:${index}`,
    kind: 'calculated',
    source: signal.strategy,
    direction: signalDirection(signal),
    score: signal.confidence,
    explanation: signal.reason,
  }));
}

export const strategyIntelligenceEngine: IntelligenceEngine<StrategyAnalysis> = {
  name: ENGINE_NAME,
  version: ENGINE_VERSION,

  analyze(context: EngineContext): EngineResult<StrategyAnalysis> {
    const startedAt = performance.now();
    const selectedStrategy = selectBestStrategy(context.candles, context.timeframe);
    const signals = runAllStrategies(context.candles, context.timeframe);
    const warnings: string[] = [];

    if (context.candles.length < selectedStrategy.minCandles) {
      warnings.push(`Selected strategy requires at least ${selectedStrategy.minCandles} candles.`);
    }
    if (signals.length === 0) {
      warnings.push('No strategy or pattern signals were detected.');
    }

    const confidence = signals.length > 0
      ? Math.max(...signals.map((signal) => signal.confidence))
      : 0;

    return {
      engineName: ENGINE_NAME,
      engineVersion: ENGINE_VERSION,
      timestamp: new Date().toISOString(),
      inputContextId: context.inputContextId,
      status: context.candles.length < selectedStrategy.minCandles ? 'degraded' : 'ok',
      result: {
        selectedStrategy: {
          name: selectedStrategy.name,
          type: selectedStrategy.type,
          timeframes: selectedStrategy.timeframes,
          minCandles: selectedStrategy.minCandles,
        },
        signals,
      },
      confidence,
      evidence: buildEvidence(signals),
      warnings,
      latencyMs: performance.now() - startedAt,
    };
  },
};