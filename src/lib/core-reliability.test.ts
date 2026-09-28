import { describe, expect, it } from 'vitest';
import { normalizeCandles } from './chart-data';
import { runBacktest } from './backtest/engine';
import { getStrategyAvailability, STRATEGY_REGISTRY } from './strategies/index';
import { pathForSidebarTab, sidebarTabFromPath } from './routes';
import type { Candle } from './types';
import { fetchWithTimeout } from './providers/request';
import { vi } from 'vitest';

function candles(count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index;
    return { time: 1_700_000_000 + index * 60, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 10 };
  });
}

describe('core reliability contracts', () => {
  it('normalizes invalid, duplicate, and out-of-order candles', () => {
    const input = candles(3).reverse();
    input.push({ ...input[1], high: 999, close: 999 });
    input.push({ ...input[0], open: NaN });
    const normalized = normalizeCandles(input);
    expect(normalized.map((candle) => candle.time)).toEqual([1_700_000_000, 1_700_000_060, 1_700_000_120]);
    expect(normalized[1].close).toBe(999);
  });

  it('keeps route serialization and parsing stable', () => {
    expect(pathForSidebarTab('backtesting')).toBe('/backtesting');
    expect(sidebarTabFromPath('/strategies')).toBe('strategies');
    expect(sidebarTabFromPath('/missing')).toBe('dashboard');
  });

  it('exposes eligible versioned strategies for the active timeframe', () => {
    const availability = getStrategyAvailability(candles(120), '1h');
    expect(STRATEGY_REGISTRY.length).toBeGreaterThanOrEqual(7);
    expect(availability.find((item) => item.strategy.id === 'trend-following')?.eligible).toBe(true);
    expect(availability.find((item) => item.strategy.id === 'mean-reversion')?.strategy.version).toBe('1.0.0');
  });

  it('returns portfolio equity and trade records from the backtest engine', () => {
    const result = runBacktest(candles(80), (history) => history.length >= 60 ? [{ strategy: 'Test', side: 'buy', confidence: 1, reason: 'test' }] : [], 1000, 5);
    expect(result.trades.length).toBeGreaterThan(0);
    expect(result.equity[result.equity.length - 1]).toBeGreaterThan(1000);
    expect(result.metrics.totalReturn).toBeGreaterThan(0);
    expect(result.trades.every((trade, index) => index === 0 || trade.entryTime > result.trades[index - 1].exitTime)).toBe(true);
  });

  it('aborts slow requests with an explicit timeout reason', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
      const signal = init?.signal as AbortSignal;
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })));

    try {
      const request = fetchWithTimeout('/request');
      const assertion = expect(request).rejects.toHaveProperty('name', 'TimeoutError');
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('rejects invalid backtest capital', () => {
    expect(() => runBacktest(candles(80), () => [], 0)).toThrow('Initial capital and holding period must be positive values.');
  });
});
