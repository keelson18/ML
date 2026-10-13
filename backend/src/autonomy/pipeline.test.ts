import { describe, expect, it } from 'vitest';
import { AutonomousPipeline } from './pipeline';

describe('AutonomousPipeline candle contract', () => {
  it('does not allow callers to bypass boundary filtering for forming candles', async () => {
    const pipeline = new AutonomousPipeline({ symbols: [] });
    const now = Math.floor(Date.now() / 3_600_000) * 3_600;
    const forming = { time: now, open: 100, high: 101, low: 99, close: 100, volume: 1 };
    await expect(pipeline.runOnce('BTCUSD', '1h', [forming], 'executor')).rejects.toThrow('No closed candle available');
  });

  it('accepts a boundary-closed candle, then respects the offline state', async () => {
    const pipeline = new AutonomousPipeline({ symbols: [] });
    const now = Math.floor(Date.now() / 3_600_000) * 3_600;
    const closed = { time: now - 3_600, open: 100, high: 101, low: 99, close: 100, volume: 1 };
    const result = await pipeline.runOnce('BTCUSD', '1h', [closed], 'executor');
    expect(result.candle).toEqual(closed);
    expect(result.skipped).toContain('OFFLINE');
  });
});
