import { describe, expect, it } from 'vitest';
import { formatMarketPrice } from './markets';

describe('market price formatting', () => {
  it('does not relabel USDT prices as USD', () => {
    expect(formatMarketPrice('BTCUSDT', 1234.5)).toBe('1,234.5 USDT');
  });

  it('formats real USD prices with a dollar sign', () => {
    expect(formatMarketPrice('BTCUSD', 1234.5)).toBe('$1,234.5');
  });

  it('labels non-USD fiat quotes explicitly', () => {
    expect(formatMarketPrice('USDJPY', 150.25)).toBe('150.25 JPY');
  });

  it('formats absent prices as unavailable', () => {
    expect(formatMarketPrice('BTCUSDT', null)).toBe('--');
  });
});
