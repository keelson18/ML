import { describe, expect, it } from 'vitest';
import {
  coinbaseProductId,
  internalSymbolFromCoinbaseProduct,
  internalSymbolFromTwelveData,
  twelveDataSymbol,
} from './LiveSymbolMap';

describe('live symbol mapping', () => {
  it('maps USD crypto to Coinbase product ids and back', () => {
    expect(coinbaseProductId('BTCUSD')).toBe('BTC-USD');
    expect(coinbaseProductId('SOLUSD')).toBe('SOL-USD');
    expect(internalSymbolFromCoinbaseProduct('BTC-USD')).toBe('BTCUSD');
  });

  it('maps forex and commodities to Twelve Data slash formats', () => {
    expect(twelveDataSymbol('EURUSD')).toBe('EUR/USD');
    expect(twelveDataSymbol('USDJPY')).toBe('USD/JPY');
    expect(twelveDataSymbol('XAUUSD')).toBe('XAU/USD');
    expect(internalSymbolFromTwelveData('EUR/USD')).toBe('EURUSD');
  });

  it('does not index stocks for a provider they are not assigned to', () => {
    expect(twelveDataSymbol('AAPL')).toBeUndefined();
    expect(internalSymbolFromTwelveData('AAPL')).toBeUndefined();
    expect(twelveDataSymbol('EURUSD')).toBe('EUR/USD');
  });

  it('never maps a symbol to the wrong provider', () => {
    expect(coinbaseProductId('EURUSD')).toBeUndefined();
    expect(coinbaseProductId('XAUUSD')).toBeUndefined();
    expect(coinbaseProductId('AAPL')).toBeUndefined();
    expect(twelveDataSymbol('BTCUSD')).toBe('BTC/USD');
    expect(twelveDataSymbol('SPX500')).toBeUndefined();
  });

  it('leaves unmapped, index, legacy and unknown symbols unmapped', () => {
    expect(twelveDataSymbol('SPX500')).toBeUndefined();
    expect(coinbaseProductId('SPX500')).toBeUndefined();
    expect(coinbaseProductId('BTCUSDT')).toBeUndefined();
    expect(twelveDataSymbol('NOTREAL')).toBeUndefined();
    expect(internalSymbolFromCoinbaseProduct('NOTREAL-USD')).toBeUndefined();
  });
});
