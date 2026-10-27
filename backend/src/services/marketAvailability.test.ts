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

import { getMarketAvailability, getProbeableMarketSymbols, marketProbeSpacingMs, probeAllMarkets, recordProviderTimeframeAvailability, resetMarketAvailabilityForTests } from './marketAvailability';

describe('market availability probe', () => {
  const oldInterval = config.marketProbeIntervalMs;
  beforeEach(() => {
    config.marketProbeIntervalMs = 1;
    resetMarketAvailabilityForTests();
    probeMock.mockReset().mockResolvedValue({ candleCount: 60, closedCandleCount: 59, latestClosedCandleAt: '2026-10-15T00:00:00.000Z', ageMs: 0, stale: false });
  });
  afterAll(() => { config.marketProbeIntervalMs = oldInterval; });

  it('starts unknown, verifies requested provider/timeframe data, and marks confirmed missing tickers unavailable', async () => {
    expect(getMarketAvailability().every((market) => market.status === 'unverified')).toBe(true);
    const { MarketDataProviderError } = await import('./marketDataService');
    probeMock.mockImplementation((symbol: string) => symbol === 'XRPUSD'
      ? Promise.reject(new MarketDataProviderError('Massive', 404, null))
      : Promise.resolve({ candleCount: 60, closedCandleCount: 59, latestClosedCandleAt: '2026-10-15T00:00:00.000Z', ageMs: 0, stale: false }));

    const probeSymbols = ['BTCUSD', 'XRPUSD'];
    const waits: number[] = [];
    const statuses = await probeAllMarkets(probeSymbols, async (ms) => { waits.push(ms); });

    expect(statuses.find((market) => market.symbol === 'BTCUSD')).toMatchObject({ status: 'verified', provider: 'twelvedata', sourceInstrument: 'BTC/USD' });
    expect(statuses.find((market) => market.symbol === 'BTCUSD')?.timeframes?.map(({ timeframe, status }) => [timeframe, status])).toEqual(
      [...new Set([...traderConfig.HTF_TIMEFRAMES, traderConfig.SETUP_TIMEFRAME, ...traderConfig.TRIGGER_TIMEFRAMES, traderConfig.MGMT_TIMEFRAME])].map((timeframe) => [timeframe, 'verified']),
    );
    expect(statuses.find((market) => market.symbol === 'XRPUSD')?.status).toBe('unavailable');
    recordProviderTimeframeAvailability('XRPUSD', '1h', 60, 59, '2026-10-15T00:00:00.000Z', 0, false);
    expect(getMarketAvailability().find((market) => market.symbol === 'XRPUSD')).toMatchObject({
      status: 'partially_verified',
      timeframes: expect.arrayContaining([expect.objectContaining({ timeframe: '1h', status: 'verified' })]),
    });
    expect(statuses).toHaveLength(MARKET_UNIVERSE.filter((market) => market.isActive).length);
    expect(statuses.find((market) => market.symbol === 'JP225')).toMatchObject({ provider: 'unsupported', status: 'unverified', reason: expect.any(String) });
    expect(probeMock).toHaveBeenCalledTimes(probeSymbols.length * 5);
    expect(probeMock.mock.calls.every(([, , limit]) => limit === 60)).toBe(true);
    expect(waits).toEqual([7_500, 7_500, 7_500, 7_500, 20_000, 20_000, 20_000, 20_000, 20_000]);
  });

  it('reports partial verification when a required timeframe has too few candles', async () => {
    probeMock.mockImplementation((_symbol: string, timeframe: string) => Promise.resolve({
      candleCount: timeframe === '4h' ? 3 : 60,
      closedCandleCount: timeframe === '4h' ? 3 : 59,
      latestClosedCandleAt: '2026-10-15T00:00:00.000Z', ageMs: 0, stale: false,
    }));
    const statuses = await probeAllMarkets(['BTCUSD'], async () => undefined);
    const btc = statuses.find((market) => market.symbol === 'BTCUSD');
    expect(btc?.status).toBe('partially_verified');
    expect(btc?.timeframes?.find((result) => result.timeframe === '4h')).toMatchObject({ status: 'partially_verified', closedCandleCount: 3 });
  });

  it('probes mapped commodities and preserves the provider-specific instrument mapping', async () => {
    expect(getProbeableMarketSymbols()).toContain('XAUUSD');
    const statuses = await probeAllMarkets(['XAUUSD'], async () => undefined);
    expect(statuses.find((market) => market.symbol === 'XAUUSD')).toMatchObject({
      status: 'verified',
      provider: 'twelvedata',
      sourceInstrument: expect.any(String),
    });
    expect(probeMock).toHaveBeenCalledTimes(5);
    expect(probeMock.mock.calls.every(([symbol]) => symbol === 'XAUUSD')).toBe(true);
  });

  it('reports stale data and rate limits distinctly without treating rate limits as unavailable', async () => {
    probeMock.mockResolvedValue({ candleCount: 60, closedCandleCount: 59, latestClosedCandleAt: '2026-10-15T00:00:00.000Z', ageMs: 99_999, stale: true });
    const stale = await probeAllMarkets(['BTCUSD'], async () => undefined);
    expect(stale.find((market) => market.symbol === 'BTCUSD')).toMatchObject({ status: 'stale' });

    resetMarketAvailabilityForTests();
    const { MarketDataProviderError } = await import('./marketDataService');
    probeMock.mockRejectedValue(new MarketDataProviderError('Twelve Data', 429, '60'));
    const limited = await probeAllMarkets(['BTCUSD'], async () => undefined);
    expect(limited.find((market) => market.symbol === 'BTCUSD')).toMatchObject({ status: 'error' });
    expect(limited.find((market) => market.symbol === 'BTCUSD')?.timeframes?.[0]).toMatchObject({
      status: 'error', errorCategory: 'rate-limited',
    });
  });

  it('paces standard probes within the provider window while reserving trader capacity', () => {
    expect(marketProbeSpacingMs(5, 60_000, 2, 1_000)).toBe(20_000);
    expect(marketProbeSpacingMs(5, 60_000, 0, 1_000)).toBe(12_000);
    expect(marketProbeSpacingMs(5, 60_000, 2, 30_000)).toBe(30_000);
  });

  it('records chart checks per timeframe and keeps the overall market unverified until every required frame passes', () => {
    recordProviderTimeframeAvailability('XAUUSD', '1h', 60, 59, '2026-10-15T00:00:00.000Z', 0, false);
    expect(getMarketAvailability().find((market) => market.symbol === 'XAUUSD')).toMatchObject({
      status: 'partially_verified',
      timeframes: [{ timeframe: '1h', status: 'verified', candleCount: 60, closedCandleCount: 59 }],
    });
    expect(getMarketAvailability().find((market) => market.symbol === 'USOIL')?.provider).toBe('twelvedata');
  });
});
