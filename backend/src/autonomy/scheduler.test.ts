import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchMarketData: vi.fn(),
  providerRequestSpacingMs: vi.fn(() => 0),
}));

vi.mock('../services/marketDataService', () => ({ fetchMarketData: mocks.fetchMarketData }));
vi.mock('./paper-autopilot', () => ({ providerRequestSpacingMs: mocks.providerRequestSpacingMs }));

import type { AutonomousPipeline } from './pipeline';
import { AutonomousScheduler } from './scheduler';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

async function flushMicrotasks() {
  for (let index = 0; index < 30; index += 1) await Promise.resolve();
}

describe('autonomous scheduler concurrency', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    mocks.fetchMarketData.mockReset();
    mocks.providerRequestSpacingMs.mockReset().mockReturnValue(0);
  });

  it('queues a candle tick behind a slow in-flight job instead of overlapping it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 15, 0, 0, 0));

    const slowFetch = deferred<{ stale: false; candles: [] }>();
    let activeFetches = 0;
    let maximumActiveFetches = 0;
    mocks.fetchMarketData.mockImplementation(async () => {
      activeFetches += 1;
      maximumActiveFetches = Math.max(maximumActiveFetches, activeFetches);
      try {
        if (mocks.fetchMarketData.mock.calls.length === 1) return await slowFetch.promise;
        return { stale: false, candles: [] };
      } finally {
        activeFetches -= 1;
      }
    });

    let startJobs: (() => void) | undefined;
    let stopJobs: (() => void) | undefined;
    const pipeline = {
      bindScheduler: (control: { start: () => void; stop: () => void }) => {
        startJobs = control.start;
        stopJobs = control.stop;
      },
      start: () => startJobs?.(),
      stop: () => stopJobs?.(),
    } as unknown as AutonomousPipeline;
    const scheduler = new AutonomousScheduler(pipeline, ['BTCUSD']);

    scheduler.start();
    await flushMicrotasks();
    expect(mocks.fetchMarketData).toHaveBeenCalledTimes(1);

    // The next candle-close timer fires while the first provider request is
    // still pending. The scheduler must append work to its serial queue.
    await vi.advanceTimersByTimeAsync(7_001);
    await flushMicrotasks();
    expect(mocks.fetchMarketData).toHaveBeenCalledTimes(1);
    expect(maximumActiveFetches).toBe(1);

    slowFetch.resolve({ stale: false, candles: [] });
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(100);
    await flushMicrotasks();

    expect(mocks.fetchMarketData.mock.calls.length).toBeGreaterThan(1);
    expect(maximumActiveFetches).toBe(1);
    expect(activeFetches).toBe(0);
  });
});
