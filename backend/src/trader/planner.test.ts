// Confirms the planner defaults to no plan when timeframe evidence is incomplete.
import { describe, expect, it } from 'vitest';
import type { Candle } from '../../../src/lib/types';
import { createTradePlan, detectTrendPullbackSetup, rankPlannerResults, stablePlanId } from './planner';

const alignedBars = (count: number, step: number, lastTime: number): Candle[] => Array.from({ length: count }, (_, index) => ({
  time: lastTime - (count - index - 1) * step, open: 100, high: 102, low: 98, close: 101, volume: 1_000,
}));

describe('Trader Desk planner', () => {
  it('uses a stable account, instrument, and trigger-candle identity for plan deduplication', () => {
    const id = stablePlanId('account-1', 'BTCUSD', '15m', 12_345);
    expect(stablePlanId('account-1', 'BTCUSD', '15m', 12_345)).toBe(id);
    expect(stablePlanId('account-2', 'BTCUSD', '15m', 12_345)).not.toBe(id);
    expect(stablePlanId('account-1', 'BTCUSDT', '15m', 12_345)).not.toBe(id);
    expect(stablePlanId('account-1', 'BTCUSD', '15m', 12_346)).not.toBe(id);
  });

  it('returns no plan when higher-timeframe history is insufficient', () => {
    const result = createTradePlan({
      accountId: 'account-1', symbol: 'BTCUSD', htfCandles: { '1d': alignedBars(10, 86_400, 0), '4h': alignedBars(10, 14_400, 72_000) },
      setupCandles: alignedBars(10, 3_600, 86_400), triggerCandles: alignedBars(10, 900, 90_000), datasetId: 'dataset-1',
    });
    expect(result.plan).toBeUndefined();
    expect(result.bias).toBe('unclear');
    expect(result.reason).toContain('bias is unclear');
  });

  it('requires a closed 1h bullish reclaim of the pullback zone before confirmation can be planned', () => {
    const setup = Array.from({ length: 50 }, (_, index) => ({
      time: index * 3_600, open: 100, high: 102, low: 100.5, close: 101, volume: 100,
    }));
    expect(detectTrendPullbackSetup(setup, { low: 99, high: 100 }, 98)).toMatchObject({ valid: false, reason: expect.stringContaining('did not test') });
    setup[49] = { time: setup[49]!.time, open: 99.5, high: 101, low: 99, close: 100.5, volume: 100 };
    expect(detectTrendPullbackSetup(setup, { low: 99, high: 100 }, 98)).toMatchObject({ valid: true, reason: expect.stringContaining('closed 1h') });
    setup[49] = { ...setup[49]!, low: 97 };
    expect(detectTrendPullbackSetup(setup, { low: 99, high: 100 }, 98)).toMatchObject({ valid: false, reason: expect.stringContaining('invalidation') });
  });

  it('rejects a 1h setup snapshot that closes after the available 15m trigger candle', () => {
    const result = createTradePlan({
      accountId: 'account-1', symbol: 'BTCUSD',
      htfCandles: { '1d': alignedBars(50, 86_400, 86_400), '4h': alignedBars(50, 14_400, 28_800) },
      setupCandles: alignedBars(50, 3_600, 360_000), triggerCandles: alignedBars(50, 900, 360_000), datasetId: 'dataset-alignment',
    });
    expect(result.plan).toBeUndefined();
    expect(result.reason).toContain('timeframe snapshots are incomplete');
  });

  it('ranks watchlist candidates by quality before applying the configured cap', () => {
    const low = { bias: 'unclear' as const, regime: 'uncertain', keyLevels: [], qualityScore: 0.1, reason: 'low' };
    const high = { ...low, qualityScore: 0.9, reason: 'high' };
    expect(rankPlannerResults([low, high])[0]?.reason).toBe('high');
  });
});
