import { describe, expect, it } from 'vitest';
import type { Timeframe } from '../../../src/lib/types';
import { researchCollectionProgress, stitchResearchCollection, type StoredResearchCandle } from './research-collection';

const TIMEFRAMES: Timeframe[] = ['15m', '1h', '4h', '1d'];
const STEPS: Record<Timeframe, number> = { '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14_400, '1d': 86_400, '1w': 604_800, '1M': 2_592_000 };

function row(timeframe: Timeframe, candleTime: number, version = `${timeframe}-v1`, provider = 'massive'): StoredResearchCandle {
  return { timeframe, candle_time: candleTime,
    candle: { time: candleTime, open: 100, high: 102, low: 99, close: 101, volume: 10 },
    provider, source_data_version: version, source_fetched_at: '2026-10-01T00:00:00.000Z' };
}

describe('durable research collection stitching', () => {
  it('stitches stored chunks in time order and binds each timeframe to a stable lineage hash', () => {
    const rows = TIMEFRAMES.flatMap((timeframe) => timeframe === '15m'
      ? [row(timeframe, 900, 'batch-a'), row(timeframe, 1800, 'batch-b')]
      : [row(timeframe, STEPS[timeframe])]).reverse();
    const result = stitchResearchCollection({ rows, symbol: 'BTCUSD', expectedTimeframes: TIMEFRAMES });
    expect(result.map((series) => series.candles.length)).toEqual([2, 1, 1, 1]);
    expect(result[0]?.candles.map((candle) => candle.time)).toEqual([900, 1800]);
    expect(result[0]?.dataVersion).toMatch(/^collection:[a-f0-9]{64}$/);
    expect(stitchResearchCollection({ rows, symbol: 'BTCUSD', expectedTimeframes: TIMEFRAMES })).toEqual(result);
    expect(stitchResearchCollection({ rows: rows.map((item) => item.timeframe === '15m' && item.candle_time === 1800
      ? { ...item, source_data_version: 'corrected-source' } : item), symbol: 'BTCUSD', expectedTimeframes: TIMEFRAMES })[0]?.dataVersion)
      .not.toBe(result[0]?.dataVersion);
  });

  it('rejects missing timeframes, mixed providers, and malformed candle lineage', () => {
    const rows = TIMEFRAMES.map((timeframe) => row(timeframe, STEPS[timeframe]));
    expect(() => stitchResearchCollection({ rows: rows.slice(1), symbol: 'BTCUSD', expectedTimeframes: TIMEFRAMES })).toThrow('missing a timeframe');
    expect(() => stitchResearchCollection({ rows: rows.map((item, index) => index ? item : { ...item, provider: 'other' }), symbol: 'BTCUSD', expectedTimeframes: TIMEFRAMES })).toThrow('mixes provider');
    expect(() => stitchResearchCollection({ rows: rows.map((item, index) => index ? item : { ...item, candle: { ...item.candle, high: 90 } }), symbol: 'BTCUSD', expectedTimeframes: TIMEFRAMES })).toThrow('invalid or unordered');
  });

  it('calculates collection progress from the first registered holdout bar and its last closed bar', () => {
    const candles = Array.from({ length: 3 }, (_, index) => ({ time: 900 + index * 900, open: 1, high: 2, low: 1, close: 2, volume: 1 }));
    expect(researchCollectionProgress({ triggerCandles: candles, triggerTimeframe: '15m', registeredStartTime: 1800 }))
      .toEqual({ testStartIndex: 1, collectedDays: 1_800 / 86_400, collectedBars: 2 });
    expect(researchCollectionProgress({ triggerCandles: candles, triggerTimeframe: '15m', registeredStartTime: 4000 }))
      .toEqual({ testStartIndex: -1, collectedDays: 0, collectedBars: 0 });
  });

  it('stitches more than one provider response into a complete 90-day 15m holdout', () => {
    const trigger = Array.from({ length: 8_640 }, (_, index) => row('15m', 900 + index * 900, `batch-${Math.floor(index / 1000)}`));
    const context = (['1h', '4h', '1d'] as const).flatMap((timeframe) =>
      Array.from({ length: 50 }, (_, index) => row(timeframe, STEPS[timeframe] + index * STEPS[timeframe])));
    const series = stitchResearchCollection({ rows: [...trigger, ...context], symbol: 'BTCUSD', expectedTimeframes: TIMEFRAMES });
    expect(series[0]?.candles).toHaveLength(8_640);
    expect(researchCollectionProgress({ triggerCandles: series[0]!.candles, triggerTimeframe: '15m', registeredStartTime: 900 }))
      .toMatchObject({ testStartIndex: 0, collectedBars: 8_640, collectedDays: 90 });
  });
});
