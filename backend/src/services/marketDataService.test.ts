import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../config';
import { fetchMarketData } from './marketDataService';

const originalMassiveKey = config.massiveApiKey;
const originalTwelveDataKey = config.twelveDataApiKey;

afterEach(() => {
  vi.unstubAllGlobals();
  config.massiveApiKey = originalMassiveKey;
  config.twelveDataApiKey = originalTwelveDataKey;
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

  it('keeps Binance USDT candles distinct from USD candles', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      [1_700_000_000_000, '100', '102', '99', '101', '3.5'],
    ]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchMarketData('BTCUSDT', '1h', 100);

    expect(String(fetchMock.mock.calls[0][0])).toContain('symbol=BTCUSDT');
    expect(result.instrument).toMatchObject({ canonicalSymbol: 'BTCUSDT', sourceSymbol: 'BTCUSDT', quoteAsset: 'USDT' });
    expect(result.dataset).toMatchObject({ provider: 'binance', sourceInstrument: 'BTCUSDT', quoteCurrency: 'USDT' });
    expect(result.dataset.id).not.toContain('BTCUSD:');
  });

  it('rejects a target instrument with no verified provider mapping', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchMarketData('JP225', '1h', 100)).rejects.toThrow('No market-data source is configured for JP225.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
