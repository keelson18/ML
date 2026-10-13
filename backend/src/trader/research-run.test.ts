import { describe, expect, it } from 'vitest';
import type { Candle, Timeframe } from '../../../src/lib/types';
import { runResearchReplay, type ResearchSeriesSnapshot } from './research-run';

// Synthetic OHLCV is used only as deterministic unit-test input; the API runner fetches provider data itself.
function series(timeframe: Timeframe, count: number, stepSeconds: number): ResearchSeriesSnapshot {
  const candles = Array.from({ length: count }, (_, index): Candle => {
    const close = 100 + index * 0.05;
    return { time: 1_700_000_000 + index * stepSeconds, open: close - 0.02, high: close + 0.1, low: close - 0.1, close, volume: 100 + index };
  });
  return { timeframe, provider: 'unit-fixture', dataVersion: `${timeframe}-fixture-v1`, fetchedAt: 1_800_000_000_000, candles };
}

function input(overrides: Partial<Parameters<typeof runResearchReplay>[0]> = {}) {
  return {
    symbol: 'BTCUSD', triggerTimeframe: '15m' as const,
    series: [series('15m', 220, 900), series('1h', 100, 3_600), series('4h', 60, 14_400), series('1d', 60, 86_400)],
    trainingEndIndex: 100, testStartIndex: 120, experimentCreatedAt: '2026-01-01T00:00:00.000Z',
    feeRate: 0.001, slippageRate: 0.0005, codeRevision: 'test-revision',
    ...overrides,
  };
}

describe('server research replay artifact', () => {
  it('replays deterministically and binds exact provider series, costs, split and versions', () => {
    const first = runResearchReplay(input());
    const second = runResearchReplay(input());
    expect(first).toEqual(second);
    expect(first.datasetId).toMatch(/^research:[a-f0-9]{64}$/);
    expect(first.costs).toEqual({ feeRate: 0.001, slippageRate: 0.0005 });
    expect(first.split).toMatchObject({ trainingEndIndex: 100, testStartIndex: 120 });
    expect(first.snapshot.map((item) => item.candles.length)).toEqual([220, 100, 60, 60]);
    expect(first.validation.promotionEligible).toBe(false);
    expect(first.baselines.buyAndHoldExpectancyR).not.toBeNull();
    expect(first.baselines.randomEntryExpectancyR).not.toBeNull();
    expect(first.baselines.randomRuns).toBeGreaterThan(0);
  });

  it('changes dataset identity when a provider correction changes one candle', () => {
    const original = input();
    const corrected = input({ series: original.series.map((item, index) => index === 0
      ? { ...item, candles: item.candles.map((candle, candleIndex) => candleIndex === 150 ? { ...candle, close: candle.close + 0.01 } : candle) }
      : item) });
    expect(runResearchReplay(corrected).datasetId).not.toBe(runResearchReplay(original).datasetId);
  });

  it('rejects overlapping splits, incomplete provider provenance, and unversioned code', () => {
    expect(() => runResearchReplay(input({ testStartIndex: 100 }))).toThrow('boundaries are invalid');
    expect(() => runResearchReplay(input({ codeRevision: 'unknown' }))).toThrow('source revision is required');
    expect(() => runResearchReplay(input({ series: [series('15m', 220, 900), series('4h', 60, 14_400)] }))).toThrow('requires provider data');
  });

  it('rejects mixed-provider timeframes and duplicate timeframe series', () => {
    const source = input();
    const mixed = source.series.map((item, index) => index === 1 ? { ...item, provider: 'another-provider' } : item);
    expect(() => runResearchReplay(input({ series: mixed }))).toThrow('one provider');
    const duplicate = [...source.series, source.series[0]!];
    expect(() => runResearchReplay(input({ series: duplicate }))).toThrow('duplicate timeframe');
  });
});
