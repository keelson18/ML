import { describe, expect, it } from 'vitest';
import { formatMarketPrice, MARKET_UNIVERSE, getMarket, getMarketsByType, setMarketAvailability } from './markets';

describe('market price formatting', () => {
  it('formats USD prices with a dollar sign', () => {
    expect(formatMarketPrice('BTCUSD', 1234.5)).toBe('$1,234.5');
  });

  it('labels non-USD fiat quotes explicitly', () => {
    expect(formatMarketPrice('USDJPY', 150.25)).toBe('150.25 JPY');
  });

  it('formats absent prices as unavailable', () => {
    expect(formatMarketPrice('BTCUSD', null)).toBe('--');
  });
});

describe('crypto market universe', () => {
  it('has no USDT-quoted crypto market', () => {
    const cryptoMarkets = MARKET_UNIVERSE.filter((m) => m.marketType === 'crypto');
    expect(cryptoMarkets.every((m) => m.quoteAsset !== 'USDT')).toBe(true);
  });

  it('configures every crypto market with a provider and source instrument', () => {
    const cryptoMarkets = MARKET_UNIVERSE.filter((m) => m.marketType === 'crypto');
    expect(cryptoMarkets.length).toBeGreaterThan(0);
    expect(cryptoMarkets.every((m) => ['massive', 'twelvedata'].includes(m.provider) && Boolean(m.sourceSymbol))).toBe(true);
    expect(cryptoMarkets.find((market) => market.symbol === 'BTCUSD')).toMatchObject({ provider: 'twelvedata', sourceSymbol: 'BTC/USD' });
  });

  it('hides confirmed unavailable markets from market pickers but retains unknown markets', () => {
    setMarketAvailability([{ symbol: 'APTUSD', status: 'unavailable', checkedAt: Date.now() }]);
    expect(getMarketsByType('crypto').some((market) => market.symbol === 'APTUSD')).toBe(false);
    expect(getMarketsByType('crypto').some((market) => market.symbol === 'BTCUSD')).toBe(true);
    setMarketAvailability([{ symbol: 'APTUSD', status: 'unverified', checkedAt: null }]);
  });
});

describe('supported market scope', () => {
  it('exposes every registered market category in category selectors', async () => {
    const { MARKET_TYPES } = await import('./types');
    expect(MARKET_TYPES.map(({ value }) => value)).toEqual(['crypto', 'forex', 'commodity', 'index', 'stock']);
  });

  it('returns registered forex, index, and stock instruments in category queries', () => {
    expect(getMarketsByType('forex').length).toBeGreaterThan(0);
    expect(getMarketsByType('index').length).toBeGreaterThan(0);
    expect(getMarketsByType('stock').length).toBeGreaterThan(0);
    expect(getMarketsByType('commodity').some((market) => market.symbol === 'XAUUSD')).toBe(true);
  });
});

describe('canonical symbol lookup', () => {
  it('does not reinterpret a different quote asset as USD', () => {
    expect(getMarket('BTCUSDT')).toBeUndefined();
    expect(getMarket('MATICUSDT')).toBeUndefined();
    expect(getMarket('ETHUSDT')).toBeUndefined();
    expect(getMarket('BTCUSD')?.symbol).toBe('BTCUSD');
  });
});
