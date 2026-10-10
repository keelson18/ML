import { describe, expect, it } from 'vitest';
import { parseLiveFeedConfig } from './config';

describe('live feed configuration', () => {
  it('defaults to disabled streaming with the owner-proposed Twelve Data symbols', () => {
    expect(parseLiveFeedConfig({})).toEqual({
      enabled: false,
      coinbase: { enabled: true, maxSymbols: 20 },
      twelveData: { enabled: true, symbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD'], maxSymbols: 8 },
      maxClients: 100,
      staleMs: 10_000,
    });
  });

  it('accepts overrides and de-duplicates symbols', () => {
    const config = parseLiveFeedConfig({
      LIVE_FEED_ENABLED: 'true',
      LIVE_FEED_TWELVEDATA_SYMBOLS: ' EURUSD, AAPL ,EURUSD',
      LIVE_FEED_TWELVEDATA_MAX_SYMBOLS: '2',
      LIVE_FEED_STALE_MS: '3000',
    });
    expect(config.enabled).toBe(true);
    expect(config.twelveData.symbols).toEqual(['EURUSD', 'AAPL']);
    expect(config.staleMs).toBe(3000);
  });

  it('rejects a Twelve Data symbol list above the configured cap', () => {
    expect(() => parseLiveFeedConfig({ LIVE_FEED_TWELVEDATA_SYMBOLS: 'EURUSD,GBPUSD,USDJPY', LIVE_FEED_TWELVEDATA_MAX_SYMBOLS: '2' }))
      .toThrow('LIVE_FEED_TWELVEDATA_SYMBOLS lists 3 symbols; the Twelve Data limit is 2.');
  });

  it('rejects symbols that Twelve Data cannot stream', () => {
    expect(() => parseLiveFeedConfig({ LIVE_FEED_TWELVEDATA_SYMBOLS: 'EURUSD,SPX500' }))
      .toThrow('LIVE_FEED_TWELVEDATA_SYMBOLS contains symbols Twelve Data cannot stream: SPX500.');
    expect(() => parseLiveFeedConfig({ LIVE_FEED_TWELVEDATA_SYMBOLS: 'BTCUSD' }))
      .toThrow('LIVE_FEED_TWELVEDATA_SYMBOLS contains symbols Twelve Data cannot stream: BTCUSD.');
  });

  it('rejects malformed flags and numeric limits', () => {
    expect(() => parseLiveFeedConfig({ LIVE_FEED_ENABLED: 'yes' })).toThrow('LIVE_FEED_ENABLED has an invalid live feed configuration value.');
    expect(() => parseLiveFeedConfig({ LIVE_FEED_MAX_CLIENTS: '0' })).toThrow('LIVE_FEED_MAX_CLIENTS has an invalid live feed configuration value.');
    expect(() => parseLiveFeedConfig({ LIVE_FEED_STALE_MS: 'soon' })).toThrow('LIVE_FEED_STALE_MS has an invalid live feed configuration value.');
  });
});
