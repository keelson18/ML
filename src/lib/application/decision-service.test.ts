import { describe, expect, it } from 'vitest';
import { analyzeDecision } from './decision-service';
import type { Candle } from '../types';

function candles(count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index * 0.25 + Math.sin(index / 3) * 2;
    return { time: index * 60, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1000 + index };
  });
}

describe('decision application service', () => {
  it('coordinates decision and explanation without persistence when no repository input is supplied', async () => {
    const result = await analyzeDecision({
      inputContextId: 'service-context',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles: candles(80),
      risk: {
        trade: { size: 1, entryPrice: 100, stopLossPrice: 99, takeProfitPrice: 102, portfolioValue: 1000 },
        state: { currentDailyPnL: -0.06, currentDrawdown: 0, currentExposure: 0, currentLeverage: 0 },
        limits: { maxDailyLoss: -0.05, maxDrawdown: -0.2, maxPortfolioExposure: 0.5, maxLeverage: 1, minRiskReward: 1.5 },
        ruleVersion: 'risk-1',
      },
      portfolio: {
        value: 1000,
        positions: [],
        proposedTrade: { symbol: 'BTCUSDT', marketType: 'crypto', size: 1, entryPrice: 100 },
        limits: { maxExposureRatio: 0.5, maxConcentrationRisk: 1, maxCorrelationRisk: 1 },
        ruleVersion: 'portfolio-1',
      },
    });

    expect(result.decision.result.decision).toBe('NO_TRADE');
    expect(result.explanation.result.summary).toContain('No trade:');
    expect(result.persisted).toBeUndefined();
  });
});