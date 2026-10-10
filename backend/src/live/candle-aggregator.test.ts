import { describe, expect, it } from 'vitest';
import { CandleAggregator } from './candle-aggregator';
import type { Tick } from './types';

function tick(seconds: number, price: number, volume: number | null = null): Tick {
  return { symbol: 'BTCUSD', price, volume, timestamp: seconds * 1000 };
}

describe('candle aggregator', () => {
  it('builds OHLC for the current 1m bucket from ticks', () => {
    const aggregator = new CandleAggregator(['1m']);
    aggregator.applyTick(tick(60, 100, 1));
    aggregator.applyTick(tick(75, 120, 2));
    aggregator.applyTick(tick(88, 90, null));
    aggregator.applyTick(tick(119, 110, 0.5));
    expect(aggregator.formingCandle('BTCUSD', '1m')).toEqual({ time: 60, open: 100, high: 120, low: 90, close: 110, volume: 3.5, forming: true });
  });

  it('starts a new candle at the bucket boundary without carrying the old range', () => {
    const aggregator = new CandleAggregator(['1m']);
    aggregator.applyTick(tick(59, 100));
    aggregator.applyTick(tick(59.999, 105));
    aggregator.applyTick(tick(60, 101));
    expect(aggregator.formingCandle('BTCUSD', '1m')).toMatchObject({ time: 60, open: 101, high: 101, low: 101, close: 101 });
  });

  it('aligns 15m, 1h and 4h buckets to UTC epoch boundaries', () => {
    const aggregator = new CandleAggregator(['15m', '1h', '4h']);
    aggregator.applyTick(tick(3_599, 10));
    aggregator.applyTick(tick(3_600, 20));
    expect(aggregator.formingCandle('BTCUSD', '1h')).toMatchObject({ time: 3_600, open: 20 });
    expect(aggregator.formingCandle('BTCUSD', '15m')).toMatchObject({ time: 3_600, open: 20 });
    expect(aggregator.formingCandle('BTCUSD', '4h')).toMatchObject({ time: 0, open: 10, high: 20, close: 20 });
  });

  it('ignores ticks older than the current forming bucket', () => {
    const aggregator = new CandleAggregator(['1m']);
    aggregator.applyTick(tick(120, 200));
    aggregator.applyTick(tick(30, 1));
    expect(aggregator.formingCandle('BTCUSD', '1m')).toMatchObject({ time: 120, open: 200, low: 200 });
  });

  it('keeps symbols separate', () => {
    const aggregator = new CandleAggregator(['1m']);
    aggregator.applyTick(tick(60, 100));
    aggregator.applyTick({ symbol: 'ETHUSD', price: 3_000, volume: null, timestamp: 60_000 });
    expect(aggregator.formingCandle('ETHUSD', '1m')).toMatchObject({ open: 3_000 });
    expect(aggregator.formingCandle('BTCUSD', '1m')).toMatchObject({ open: 100 });
  });

  it('is replaced by a closed REST candle for the same or a later bucket', () => {
    const aggregator = new CandleAggregator(['1m']);
    aggregator.applyTick(tick(60, 100));
    aggregator.applyClosedCandle('BTCUSD', '1m', 60);
    expect(aggregator.formingCandle('BTCUSD', '1m')).toBeUndefined();
  });

  it('keeps the forming candle when the closed candle is for an earlier bucket', () => {
    const aggregator = new CandleAggregator(['1m']);
    aggregator.applyTick(tick(120, 100));
    aggregator.applyClosedCandle('BTCUSD', '1m', 60);
    expect(aggregator.formingCandle('BTCUSD', '1m')).toMatchObject({ time: 120 });
  });

  it('returns copies so callers cannot mutate forming state', () => {
    const aggregator = new CandleAggregator(['1m']);
    aggregator.applyTick(tick(60, 100));
    const candle = aggregator.formingCandle('BTCUSD', '1m');
    if (candle) candle.close = 999;
    expect(aggregator.formingCandle('BTCUSD', '1m')).toMatchObject({ close: 100 });
  });

  it('rejects timeframes that have no fixed length', () => {
    expect(() => new CandleAggregator(['1w'])).toThrow('Timeframe 1w cannot be aggregated from ticks.');
  });
});
