import { describe, expect, it } from 'vitest';
import { isPerfOverlayEnabled, latestTiming, measureAsync, percentile, recordTiming } from './perf';

describe('perf helpers', () => {
  it('computes nearest-rank percentiles and handles empty input', () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([10, 20, 30, 40], 95)).toBe(40);
    expect(percentile([], 50)).toBeNull();
  });

  it('keeps the latest sample and records async duration even on failure', async () => {
    recordTiming('test.sample', 5);
    recordTiming('test.sample', 7);
    expect(latestTiming('test.sample')).toBe(7);
    await expect(measureAsync('test.failing', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(latestTiming('test.failing')).not.toBeNull();
  });

  it('shows the overlay only with the query flag and admin or development context', () => {
    expect(isPerfOverlayEnabled('', true, true)).toBe(false);
    expect(isPerfOverlayEnabled('?perf=1', false, false)).toBe(false);
    expect(isPerfOverlayEnabled('?perf=1', true, false)).toBe(true);
    expect(isPerfOverlayEnabled('?perf=1', false, true)).toBe(true);
  });
});
