import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../config';
import { fetchMarketData, clearMarketDataCache } from './marketDataService';

const originalMassiveKey = config.massiveApiKey;
const originalTwelveDataKey = config.twelveDataApiKey;
const originalMaxCacheEntries = config.marketDataCacheMaxEntries;
const originalMaxStaleMultiplier = config.marketDataMaxStaleTtlMultiplier;

// Build a valid one-candle Massive response with a caller-selected timestamp.
function massiveResponse(time = 1_700_000_000_000, status = 200): Response {
  return new Response(JSON.stringify({
    status: status === 200 ? 'OK' : 'ERROR',
    results: status === 200 ? [{ t: time, o: 100, h: 102, l: 99, c: 101, v: 50 }] : undefined,
  }), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
  config.massiveApiKey = originalMassiveKey;
  config.twelveDataApiKey = originalTwelveDataKey;
  config.marketDataCacheMaxEntries = originalMaxCacheEntries;
  config.marketDataMaxStaleTtlMultiplier = originalMaxStaleMultiplier;
  vi.useRealTimers();
  clearMarketDataCache();
});

describe('market data instrument mapping', () => {
  it('requests true USD crypto data using the Massive source ticker', async () => {
    config.massiveApiKey = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'OK',
      results: [{ t: 1_700_000_000_000, o: 100, h: 102, l: 99, c: 101, v: 50 }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchMarketData('BTCUSD', '1h', 100);
    const requestUrl = String(fetchMock.mock.calls[0][0]);

    expect(requestUrl).toContain('/ticker/X%3ABTCUSD/');
    expect(result.instrument).toMatchObject({ canonicalSymbol: 'BTCUSD', sourceSymbol: 'X:BTCUSD', quoteAsset: 'USD' });
    expect(result.identity).toMatchObject({ canonicalSymbol: 'BTCUSD', sourceSymbol: 'X:BTCUSD', provider: 'massive' });
    expect(result.dataset).toMatchObject({ provider: 'massive', sourceInstrument: 'X:BTCUSD', quoteCurrency: 'USD', timeframe: '1h' });
  });

  it('sends the Massive key in an Authorization header, never in the URL', async () => {
    config.massiveApiKey = 'server-test-key';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'OK',
      results: [{ t: 1_700_000_000_000, o: 100, h: 102, l: 99, c: 101, v: 50 }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchMarketData('BTCUSD', '1h', 100);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0];

    expect(String(requestUrl)).not.toContain('server-test-key');
    expect(requestInit?.headers).toMatchObject({ Authorization: 'Bearer server-test-key' });
  });

  it('uses Twelve Data source symbols for EURUSD and XAUUSD', async () => {
    config.twelveDataApiKey = 'server-twelve-key';
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      status: 'ok',
      values: [{ datetime: '2026-10-03 12:00:00', open: '100', high: '102', low: '99', close: '101', volume: '50' }],
    }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);

    const eurUsd = await fetchMarketData('EURUSD', '1h', 100);
    const xauUsd = await fetchMarketData('XAUUSD', '1h', 100);

    expect(String(fetchMock.mock.calls[0][0])).toContain('symbol=EUR%2FUSD');
    expect(String(fetchMock.mock.calls[1][0])).toContain('symbol=XAU%2FUSD');
    expect(eurUsd.dataset).toMatchObject({ provider: 'twelvedata', sourceInstrument: 'EUR/USD', quoteCurrency: 'USD' });
    expect(xauUsd.dataset).toMatchObject({ provider: 'twelvedata', sourceInstrument: 'XAU/USD', quoteCurrency: 'USD' });
  });

  it('uses the Massive stock source symbol for AAPL', async () => {
    config.massiveApiKey = 'server-massive-key';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'OK',
      results: [{ t: 1_700_000_000_000, o: 100, h: 102, l: 99, c: 101, v: 50 }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchMarketData('AAPL', '1h', 100);

    expect(String(fetchMock.mock.calls[0][0])).toContain('/ticker/AAPL/');
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer server-massive-key' });
    expect(result.dataset).toMatchObject({ provider: 'massive', sourceInstrument: 'AAPL', quoteCurrency: 'USD' });
  });

  it('resolves legacy USDT symbols to canonical USD symbols via Massive', async () => {
    config.massiveApiKey = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'OK',
      results: [{ t: 1_700_000_000_000, o: 100, h: 102, l: 99, c: 101, v: 50 }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchMarketData('BTCUSDT', '1h', 100);
    const requestUrl = String(fetchMock.mock.calls[0][0]);

    expect(requestUrl).toContain('/ticker/X%3ABTCUSD/');
    expect(result.instrument).toMatchObject({ canonicalSymbol: 'BTCUSD', quoteAsset: 'USD' });
    expect(result.dataset).toMatchObject({ provider: 'massive', quoteCurrency: 'USD' });
  });

  it('rejects a target instrument with no verified provider mapping', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchMarketData('JP225', '1h', 100)).rejects.toThrow('No market-data source is configured for JP225.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('market data cache freshness and bounds', () => {
  it('returns an unexpired cached result without another provider request', async () => {
    config.massiveApiKey = 'test-key';
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(massiveResponse()));
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchMarketData('BTCUSD', '1h', 100);
    const second = await fetchMarketData('BTCUSD', '1h', 100);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.stale).toBe(false);
    expect(second.stale).toBe(false);
    expect(second.fetchedAt).toBe(first.fetchedAt);
  });

  it('refetches after the timeframe TTL expires', async () => {
    config.massiveApiKey = 'test-key';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T00:00:00Z'));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(massiveResponse())
      .mockResolvedValueOnce(massiveResponse(1_700_003_600_000));
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchMarketData('BTCUSD', '1h', 100);
    await vi.advanceTimersByTimeAsync(60_001);
    const second = await fetchMarketData('BTCUSD', '1h', 100);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(second.fetchedAt).toBeGreaterThan(first.fetchedAt);
    expect(second.stale).toBe(false);
  });

  it('serves an expired result as stale only while within the configured age bound', async () => {
    config.massiveApiKey = 'test-key';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T00:00:00Z'));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(massiveResponse())
      .mockResolvedValueOnce(massiveResponse(1_700_000_000_000, 503));
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchMarketData('BTCUSD', '1h', 100);
    await vi.advanceTimersByTimeAsync(60_001);
    const stale = await fetchMarketData('BTCUSD', '1h', 100);

    expect(stale.stale).toBe(true);
    expect(stale.fetchedAt).toBe(first.fetchedAt);
  });

  it('throws when provider failure occurs after the stale age bound', async () => {
    config.massiveApiKey = 'test-key';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T00:00:00Z'));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(massiveResponse())
      .mockResolvedValueOnce(massiveResponse(1_700_000_000_000, 503));
    vi.stubGlobal('fetch', fetchMock);

    await fetchMarketData('BTCUSD', '1h', 100);
    await vi.advanceTimersByTimeAsync(180_001);

    await expect(fetchMarketData('BTCUSD', '1h', 100)).rejects.toThrow('Massive market data failed (503).');
  });

  it('evicts least-recently-used entries when the configured bound is reached', async () => {
    config.massiveApiKey = 'test-key';
    config.marketDataCacheMaxEntries = 1;
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(massiveResponse()));
    vi.stubGlobal('fetch', fetchMock);

    await fetchMarketData('BTCUSD', '1h', 100);
    await fetchMarketData('ETHUSD', '1h', 100);
    await fetchMarketData('BTCUSD', '1h', 100);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
