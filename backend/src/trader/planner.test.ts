// Confirms the planner defaults to no plan when timeframe evidence is incomplete.
import { describe, expect, it } from 'vitest';
import type { Candle } from '../../../src/lib/types';
import { createTradePlan, rankPlannerResults } from './planner';

const candleSeries: Candle[] = Array.from({ length: 10 }, (_, index) => ({
  time: index * 60, open: 100, high: 102, low: 98, close: 100 + index / 10, volume: 1_000,
}));

describe('Trader Desk planner', () => {
  it('returns no plan when higher-timeframe history is insufficient', () => {
    const result = createTradePlan({
      accountId: 'account-1', symbol: 'BTCUSD', htfCandles: { '1d': candleSeries, '4h': candleSeries },
      triggerCandles: candleSeries, datasetId: 'dataset-1',
    });
    expect(result.plan).toBeUndefined();
    expect(result.bias).toBe('unclear');
    expect(result.reason).toContain('bias is unclear');
  });

  it('ranks watchlist candidates by quality before applying the configured cap', () => {
    const low = { bias: 'unclear' as const, regime: 'uncertain', keyLevels: [], qualityScore: 0.1, reason: 'low' };
    const high = { ...low, qualityScore: 0.9, reason: 'high' };
    expect(rankPlannerResults([low, high])[0]?.reason).toBe('high');
  });
});
