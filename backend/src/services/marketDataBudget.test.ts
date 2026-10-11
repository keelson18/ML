import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../config';
import { MarketDataProviderError, clearMarketDataCache, fetchMarketData, getMassiveBudgetSnapshot, getTwelveDataBudgetSnapshot, resetMassiveBudgetForTests } from './marketDataService';

const original = {
  massiveApiKey: config.massiveApiKey,
  massiveRequestsPerWindow: config.massiveRequestsPerWindow,
  massiveBudgetWindowMs: config.massiveBudgetWindowMs,
  massiveBudgetMaxWaitMs: config.massiveBudgetMaxWaitMs,
  massiveBudgetMaxQueue: config.massiveBudgetMaxQueue,
  twelveDataApiKey: config.twelveDataApiKey,
  twelveDataRequestsPerWindow: config.twelveDataRequestsPerWindow,
  twelveDataBudgetWindowMs: config.twelveDataBudgetWindowMs,
  twelveDataBudgetMaxWaitMs: config.twelveDataBudgetMaxWaitMs,
  twelveDataBudgetMaxQueue: config.twelveDataBudgetMaxQueue,
};

function twelveDataOk(): Response {
  return new Response(JSON.stringify({ status: 'ok', values: [{ datetime: '2026-10-03 12:00:00', open: '100', high: '102', low: '99', close: '101', volume: '50' }] }), { status: 200 });
}

function massiveOk(): Response {
  return new Response(JSON.stringify({ status: 'OK', results: [{ t: 1_700_000_000_000, o: 100, h: 102, l: 99, c: 101, v: 50 }] }), { status: 200 });
}

beforeEach(() => {
  config.massiveApiKey = 'test-key';
  config.massiveRequestsPerWindow = 1;
  config.massiveBudgetWindowMs = 60_000;
  config.massiveBudgetMaxWaitMs = 1_000;
  config.massiveBudgetMaxQueue = 10;
  config.twelveDataApiKey = 'test-twelve-key';
  config.twelveDataRequestsPerWindow = 1;
  config.twelveDataBudgetWindowMs = 60_000;
  config.twelveDataBudgetMaxWaitMs = 1_000;
  config.twelveDataBudgetMaxQueue = 10;
  resetMassiveBudgetForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.assign(config, original);
  resetMassiveBudgetForTests();
  clearMarketDataCache();
});

describe('Massive request budget', () => {
  it('fails with 429 without calling the provider when the budget cannot be met in time', async () => {
    const fetchMock = vi.fn().mockResolvedValue(massiveOk());
    vi.stubGlobal('fetch', fetchMock);

    await fetchMarketData('BTCUSD', '1h', 100);
    const rejected = await fetchMarketData('BTCUSD', '4h', 100).catch((error: unknown) => error);

    expect(rejected).toBeInstanceOf(MarketDataProviderError);
    expect(rejected).toMatchObject({ status: 429, provider: 'Massive' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails Twelve Data with 429 without calling the provider when its own budget is spent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(twelveDataOk());
    vi.stubGlobal('fetch', fetchMock);

    await fetchMarketData('EURUSD', '1h', 100);
    const rejected = await fetchMarketData('EURUSD', '4h', 100).catch((error: unknown) => error);

    expect(rejected).toMatchObject({ status: 429, provider: 'Twelve Data' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getTwelveDataBudgetSnapshot().usedInWindow).toBe(1);
    expect(getMassiveBudgetSnapshot().usedInWindow).toBe(0);
  });

  it('pauses later Massive requests after a provider 429 using Retry-After', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"status":"ERROR"}', { status: 429, headers: { 'retry-after': '30' } }));
    vi.stubGlobal('fetch', fetchMock);
    config.massiveRequestsPerWindow = 100;

    await expect(fetchMarketData('BTCUSD', '1h', 100)).rejects.toMatchObject({ status: 429 });
    await expect(fetchMarketData('BTCUSD', '4h', 100)).rejects.toMatchObject({ status: 429 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getMassiveBudgetSnapshot().backoffUntil).not.toBeNull();
  });
});
