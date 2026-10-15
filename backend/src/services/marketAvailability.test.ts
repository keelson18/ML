// Protects the unknown-by-default status and provider-confirmed availability transitions.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../config';
import { MARKET_UNIVERSE } from '../../../src/lib/markets';
import { traderConfig } from '../trader/config';

const { probeMock } = vi.hoisted(() => ({ probeMock: vi.fn() }));
vi.mock('./marketDataService', () => ({
  probeMarketData: probeMock,
  MarketDataProviderError: class MarketDataProviderError extends Error {
    constructor(readonly provider: string, readonly status: number, readonly retryAfter: string | null) { super('provider request failed'); }
  },
}));

import { getMarketAvailability, marketProbeSpacingMs, probeAllMarkets } from './marketAvailability';

describe('market availability probe', () => {
  const oldInterval = config.marketProbeIntervalMs;
  beforeEach(() => {
    config.marketProbeIntervalMs = 1;
    probeMock.mockReset().mockResolvedValue({ candleCount: 60, closedCandleCount: 59, latestClosedCandleAt: '2026-10-15T00:00:00.000Z', ageMs: 0, stale: false });
  });
  afterAll(() => { config.marketProbeIntervalMs = oldInterval; });

  it('starts unknown, marks valid data available, and marks only confirmed missing tickers unavailable', async () => {
    expect(getMarketAvailability().every((market) => market.status === 'unverified')).toBe(true);
    const { MarketDataProviderError } = await import('./marketDataService');
    probeMock.mockImplementation((symbol: string) => symbol === 'XRPUSD'
      ? Promise.reject(new MarketDataProviderError('Massive', 404, null))
      : Promise.resolve({ candleCount: 60, closedCandleCount: 59, latestClosedCandleAt: '2026-10-15T00:00:00.000Z', ageMs: 0, stale: false }));

    const probeSymbols = ['BTCUSD', 'XRPUSD'];
    const waits: number[] = [];
    const statuses = await probeAllMarkets(probeSymbols, async (ms) => { waits.push(ms); });

    expect(statuses.find((market) => market.symbol === 'BTCUSD')).toMatchObject({ status: 'available', provider: 'twelvedata', sourceInstrument: 'BTC/USD' });
    expect(statuses.find((market) => market.symbol === 'BTCUSD')?.timeframes?.map(({ timeframe, status }) => [timeframe, status])).toEqual(
      [...new Set([...traderConfig.HTF_TIMEFRAMES, traderConfig.SETUP_TIMEFRAME, ...traderConfig.TRIGGER_TIMEFRAMES, traderConfig.MGMT_TIMEFRAME])].map((timeframe) => [timeframe, 'available']),
    );
    expect(statuses.find((market) => market.symbol === 'XRPUSD')?.status).toBe('unavailable');
    expect(statuses).toHaveLength(MARKET_UNIVERSE.filter((market) => market.isActive && market.marketType === 'crypto' && market.priceCurrency === 'USD' && ['massive', 'twelvedata'].includes(market.provider) && Boolean(market.sourceSymbol)).length);
    expect(probeMock).toHaveBeenCalledTimes(probeSymbols.length * 5);
    expect(probeMock.mock.calls.every(([, , limit]) => limit === 60)).toBe(true);
    expect(waits).toEqual([7_500, 7_500, 7_500, 7_500, 20_000, 20_000, 20_000, 20_000, 20_000]);
  });

  it('keeps a symbol unverified when any required timeframe has too few or stale closed candles', async () => {
    probeMock.mockImplementation((_symbol: string, timeframe: string) => Promise.resolve({
      candleCount: timeframe === '4h' ? 3 : 60,
      closedCandleCount: timeframe === '4h' ? 3 : 59,
      latestClosedCandleAt: '2026-10-15T00:00:00.000Z', ageMs: 0, stale: false,
    }));
    const statuses = await probeAllMarkets(['BTCUSD'], async () => undefined);
    const btc = statuses.find((market) => market.symbol === 'BTCUSD');
    expect(btc?.status).toBe('unverified');
    expect(btc?.timeframes?.find((result) => result.timeframe === '4h')).toMatchObject({ status: 'unverified', closedCandleCount: 3 });
  });

  it('paces standard probes within the provider window while reserving trader capacity', () => {
    expect(marketProbeSpacingMs(5, 60_000, 2, 1_000)).toBe(20_000);
    expect(marketProbeSpacingMs(5, 60_000, 0, 1_000)).toBe(12_000);
    expect(marketProbeSpacingMs(5, 60_000, 2, 30_000)).toBe(30_000);
  });
});
