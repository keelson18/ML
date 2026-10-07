// Protects the unknown-by-default status and provider-confirmed availability transitions.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../config';
import { MARKET_UNIVERSE } from '../../../src/lib/markets';

const { probeMock } = vi.hoisted(() => ({ probeMock: vi.fn() }));
vi.mock('./marketDataService', () => ({
  probeMarketData: probeMock,
  MarketDataProviderError: class MarketDataProviderError extends Error {
    constructor(readonly provider: string, readonly status: number, readonly retryAfter: string | null) { super('provider request failed'); }
  },
}));

import { getMarketAvailability, probeAllMarkets } from './marketAvailability';

describe('market availability probe', () => {
  const oldInterval = config.marketProbeIntervalMs;
  beforeEach(() => {
    config.marketProbeIntervalMs = 1;
    probeMock.mockReset().mockResolvedValue({ candleCount: 5 });
  });
  afterAll(() => { config.marketProbeIntervalMs = oldInterval; });

  it('starts unknown, marks valid data available, and marks only confirmed missing tickers unavailable', async () => {
    expect(getMarketAvailability().every((market) => market.status === 'unverified')).toBe(true);
    const { MarketDataProviderError } = await import('./marketDataService');
    probeMock.mockImplementation((symbol: string) => symbol === 'XRPUSD'
      ? Promise.reject(new MarketDataProviderError('Massive', 404, null))
      : Promise.resolve({ candleCount: 5 }));

    const statuses = await probeAllMarkets();

    expect(statuses.find((market) => market.symbol === 'BTCUSD')).toMatchObject({ status: 'available', candleCount: 5 });
    expect(statuses.find((market) => market.symbol === 'XRPUSD')?.status).toBe('unavailable');
    expect(statuses).toHaveLength(MARKET_UNIVERSE.filter((market) => market.isActive && market.marketType === 'crypto' && market.provider === 'massive').length);
  });
});
