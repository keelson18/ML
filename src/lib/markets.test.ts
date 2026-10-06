import { describe, expect, it } from 'vitest';
import { formatMarketPrice, MARKET_UNIVERSE, getMarket, resolveLegacySymbol } from './markets';

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

  it('every crypto market has provider massive and sourceSymbol starting with X:', () => {
    const cryptoMarkets = MARKET_UNIVERSE.filter((m) => m.marketType === 'crypto');
    expect(cryptoMarkets.length).toBeGreaterThan(0);
    expect(cryptoMarkets.every((m) => m.provider === 'massive')).toBe(true);
    expect(cryptoMarkets.every((m) => m.sourceSymbol?.startsWith('X:'))).toBe(true);
  });
});

describe('legacy symbol resolution', () => {
  it('resolves BTCUSDT to BTCUSD', () => {
    expect(resolveLegacySymbol('BTCUSDT')).toBe('BTCUSD');
  });

  it('resolves MATICUSDT to POLUSD', () => {
    expect(resolveLegacySymbol('MATICUSDT')).toBe('POLUSD');
  });

  it('passes through non-legacy symbols unchanged', () => {
    expect(resolveLegacySymbol('BTCUSD')).toBe('BTCUSD');
  });

  it('getMarket resolves legacy symbols', () => {
    const market = getMarket('ETHUSDT');
    expect(market?.symbol).toBe('ETHUSD');
  });
});
