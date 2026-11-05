import { describe, expect, it } from 'vitest';
import { formatMarketPrice, MARKET_UNIVERSE, getDiscoverableMarkets, getMarket, getMarketsByType, getPaperTradableMarkets, getSupportedProductMarkets, getTrackedMarkets, isSupportedProductMarket, setMarketAvailability } from './markets';
import { providerAdapterFor, providerSupport } from './marketCapabilities';

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

describe('supported product discovery', () => {
  it('discovers every asset class with a provider mapping and no coverage tier', () => {
    const symbols = new Set(getSupportedProductMarkets().map((market) => market.symbol));
    for (const symbol of ['BTCUSD', 'XAUUSD', 'EURUSD', 'SPX500', 'AAPL']) expect(symbols.has(symbol)).toBe(true);
    const classes = new Set(getSupportedProductMarkets().map((market) => market.marketType));
    expect([...classes].sort()).toEqual(['commodity', 'crypto', 'forex', 'index', 'stock']);
  });

  it('keeps instruments whose registry provider has no adapter out of the actionable set', () => {
    expect(getDiscoverableMarkets().some((market) => market.symbol === 'JP225')).toBe(true);
    expect(getSupportedProductMarkets().some((market) => market.symbol === 'JP225')).toBe(false);
  });

  it('limits paper trading to USD-settled instruments across every asset class', () => {
    const symbols = new Set(getPaperTradableMarkets().map((market) => market.symbol));
    for (const symbol of ['BTCUSD', 'XAUUSD', 'EURUSD', 'SPX500', 'AAPL']) expect(symbols.has(symbol)).toBe(true);
    for (const symbol of ['USDJPY', 'EURJPY', 'GER40', 'JP225']) expect(symbols.has(symbol)).toBe(false);
  });

  it('excludes inactive registry entries even when their category is supported', () => {
    const active = MARKET_UNIVERSE.find((market) => market.marketType === 'crypto')!;
    expect(isSupportedProductMarket({ ...active, isActive: false })).toBe(false);
    expect(isSupportedProductMarket(active)).toBe(true);
  });

  it('tracks all provider-supported asset classes for analysis and trading surfaces', () => {
    const classes = new Set(getTrackedMarkets().map((market) => market.marketType));
    expect([...classes].sort()).toEqual(['commodity', 'crypto', 'forex', 'index', 'stock']);
  });

  it('keeps provider-confirmed-unavailable instruments discoverable', () => {
    setMarketAvailability([{ symbol: 'APTUSD', status: 'unavailable', checkedAt: Date.now() }]);
    try {
      expect(getSupportedProductMarkets().some((market) => market.symbol === 'APTUSD')).toBe(true);
    } finally {
      setMarketAvailability([{ symbol: 'APTUSD', status: 'unverified', checkedAt: null }]);
    }
  });
});

describe('registry integrity', () => {
  it('keeps canonical symbols unique', () => {
    const symbols = MARKET_UNIVERSE.map((market) => market.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it('never exposes a USDT pair or silently reinterprets one as USD', () => {
    expect(MARKET_UNIVERSE.some((market) => market.symbol.includes('USDT'))).toBe(false);
    expect(getMarket('BTCUSDT')).toBeUndefined();
  });

  it('resolves a source symbol for every provider-supported instrument', () => {
    for (const market of getSupportedProductMarkets()) {
      const support = providerSupport(market);
      expect({ symbol: market.symbol, supported: support.supported, source: Boolean(support.sourceSymbol) })
        .toEqual({ symbol: market.symbol, supported: true, source: true });
    }
  });

  it('does not advertise a provider adapter that is not implemented', () => {
    for (const market of MARKET_UNIVERSE.filter((candidate) => candidate.isActive)) {
      expect({ symbol: market.symbol, supported: providerAdapterFor(market.provider) !== null })
        .toEqual({ symbol: market.symbol, supported: ['massive', 'twelvedata'].includes(market.provider) });
    }
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
