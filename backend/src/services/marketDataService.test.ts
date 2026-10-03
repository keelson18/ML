import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../config';
import { fetchMarketData } from './marketDataService';

const originalMassiveKey = config.massiveApiKey;

afterEach(() => {
  vi.unstubAllGlobals();
  config.massiveApiKey = originalMassiveKey;
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

    await expect(fetchMarketData('SPX500', '1h', 100)).rejects.toThrow('No market-data source is configured for SPX500.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
