import { describe, expect, it } from 'vitest';
import type { Candle } from '../../../src/lib/types';
import { analyzeMarketIntelligence } from './orchestrator';
import { contradictionEngine, type ContradictionEngineContext } from './contradiction-engine';

const candles: Candle[] = Array.from({ length: 80 }, (_, index) => {
  const close = 100 + index * 0.25 + Math.sin(index / 3) * 2;
  return { time: index * 60, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1_000 + index };
});

function buildContext(overrides: Partial<ContradictionEngineContext> = {}): ContradictionEngineContext {
  const inputContextId = 'contradiction-engine-test';
  return {
    inputContextId,
    symbol: 'BTCUSD',
    timeframe: '1h',
    candles,
    market: analyzeMarketIntelligence({ inputContextId, symbol: 'BTCUSD', timeframe: '1h', candles }),
    decisionDirection: 'buy',
    riskApproved: true,
    portfolioApproved: true,
    dataQualityBlocked: false,
    ...overrides,
  };
}

describe('contradiction engine', () => {
  it('detects opposing ML direction only when model lineage is complete', () => {
    const result = contradictionEngine.analyze(buildContext({
      mlDirection: 'sell',
      mlLineageComplete: true,
      historicalSampleQuality: 'high',
    }));

    expect(result.result.contradictions).toContainEqual({
      severity: 'medium',
      detail: 'ML prediction (sell) conflicts with the deterministic direction (buy).',
      involvedSources: ['ml-intelligence', 'strategy-intelligence'],
    });
    expect(result.evidence.some((item) => item.source === 'contradiction')).toBe(true);
    expect(result.inputContextId).toBe('contradiction-engine-test');
  });

  it('does not count unverified ML direction as a contradiction', () => {
    const result = contradictionEngine.analyze(buildContext({
      mlDirection: 'sell',
      mlLineageComplete: false,
      historicalSampleQuality: 'high',
    }));

    expect(result.result.contradictions.some((item) => item.detail.startsWith('ML prediction'))).toBe(false);
  });

  it('blocks the decision and emits a high-severity finding when a hard gate rejects', () => {
    const result = contradictionEngine.analyze(buildContext({ riskApproved: false }));

    expect(result.result.blocksDecision).toBe(true);
    expect(result.result.maxSeverity).toBe('high');
    expect(result.result.contradictions).toContainEqual({
      severity: 'high',
      detail: 'Risk intelligence rejected the proposal.',
      involvedSources: ['risk-intelligence'],
    });
    expect(result.status).toBe('degraded');
    expect(result.confidence).toBe(0);
  });

  it('returns versioned engine metadata and a neutral result when no conflict is present', () => {
    const market = analyzeMarketIntelligence({ inputContextId: 'clean-context', symbol: 'BTCUSD', timeframe: '1h', candles });
    const result = contradictionEngine.analyze(buildContext({
      inputContextId: 'clean-context',
      market: {
        ...market,
        strategy: { ...market.strategy, result: { ...market.strategy.result, signals: [] } },
        regime: { ...market.regime, result: { ...market.regime.result, regime: 'trending' } },
        context: { ...market.context, result: { ...market.context.result, trendState: 'ranging', momentumState: 'neutral', volatilityState: 'normal' } },
      },
      decisionDirection: 'neutral',
      historicalSampleQuality: 'high',
    }));

    expect(result.engineName).toBe('contradiction');
    expect(result.engineVersion).toBe('1.0.0');
    expect(result.timestamp).toEqual(expect.any(String));
    expect(result.result).toEqual({ contradictions: [], count: 0, maxSeverity: 'none', blocksDecision: false });
    expect(result.status).toBe('ok');
  });
});
