import { describe, expect, it } from 'vitest';
import { analyzeMarketIntelligence } from './orchestrator';
import { confidenceEngine } from './confidence-engine';
import type { Candle } from '../../../src/lib/types';

const candles: Candle[] = Array.from({ length: 80 }, (_, index) => {
  const close = 100 + index * 0.25 + Math.sin(index / 3) * 2;
  return { time: index * 60, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1_000 + index };
});

describe('confidence engine calibration handling', () => {
  it('does not treat a high uncalibrated model probability as confidence evidence', () => {
    const market = analyzeMarketIntelligence({ inputContextId: 'uncalibrated-model', symbol: 'BTCUSD', timeframe: '1h', candles });
    const result = confidenceEngine.analyze({
      inputContextId: 'uncalibrated-model', symbol: 'BTCUSD', timeframe: '1h', candles, market,
      evidence: [], contradictions: [], riskApproved: true, portfolioApproved: true, dataQualityBlocked: false,
      decisionDirection: 'neutral', modelProbability: 0.99, modelCalibrated: false,
    });
    expect(result.result.factors.find((factor) => factor.factor === 'model-calibration')?.score).toBe(0.5);
    expect(result.result.factors).toHaveLength(8);
    expect(result.result.factors.reduce((sum, factor) => sum + factor.weight, 0)).toBeCloseTo(1);
  });

  it('reports the bounded contradiction penalty used to reduce the aggregate score', () => {
    const market = analyzeMarketIntelligence({ inputContextId: 'contradiction-penalty', symbol: 'BTCUSD', timeframe: '1h', candles });
    const result = confidenceEngine.analyze({
      inputContextId: 'contradiction-penalty', symbol: 'BTCUSD', timeframe: '1h', candles, market,
      evidence: [], contradictions: [
        { severity: 'high', detail: 'Strong opposing evidence.' },
        { severity: 'high', detail: 'Second opposing signal.' },
        { severity: 'medium', detail: 'Mixed evidence.' },
      ],
      riskApproved: true, portfolioApproved: true, dataQualityBlocked: false, decisionDirection: 'buy',
    });

    expect(result.result.contradictionPenalty).toBe(1);
    expect(result.result.overall).toBe(0);
  });

  it('keeps confidence at zero when hard risk gates reject regardless of probability', () => {
    const market = analyzeMarketIntelligence({ inputContextId: 'blocked-model', symbol: 'BTCUSD', timeframe: '1h', candles });
    const result = confidenceEngine.analyze({
      inputContextId: 'blocked-model', symbol: 'BTCUSD', timeframe: '1h', candles, market,
      evidence: [], contradictions: [], riskApproved: false, portfolioApproved: true, dataQualityBlocked: false,
      decisionDirection: 'buy', modelProbability: 0.999, modelCalibrated: true,
    });
    expect(result.result.overall).toBe(0);
    expect(result.result.riskBlocked).toBe(true);
  });
});
