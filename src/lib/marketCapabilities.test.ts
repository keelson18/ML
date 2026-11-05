import { describe, expect, it } from 'vitest';
import { getMarket } from './markets';
import {
  contractSize,
  isProviderSupportedMarket,
  marketSessionModel,
  paperEligibilityReason,
  paperSettlementEligible,
  pricePrecision,
  providerAdapterFor,
  providerSupport,
  resolveSourceSymbol,
  settlementCurrency,
  supportsPlanSide,
  tickSize,
} from './marketCapabilities';

function market(symbol: string) {
  const instrument = getMarket(symbol);
  if (!instrument) throw new Error(`missing registry instrument ${symbol}`);
  return instrument;
}

describe('provider capability resolution', () => {
  it('maps every asset class to a real provider adapter and source symbol', () => {
    expect(providerSupport(market('BTCUSD'))).toMatchObject({ supported: true, provider: 'twelvedata', sourceSymbol: 'BTC/USD' });
    expect(providerSupport(market('ETHUSD'))).toMatchObject({ supported: true, provider: 'massive', sourceSymbol: 'X:ETHUSD' });
    expect(providerSupport(market('XAUUSD'))).toMatchObject({ supported: true, provider: 'twelvedata', sourceSymbol: 'XAU/USD' });
    expect(providerSupport(market('EURUSD'))).toMatchObject({ supported: true, provider: 'twelvedata', sourceSymbol: 'EUR/USD' });
    expect(providerSupport(market('SPX500'))).toMatchObject({ supported: true, provider: 'massive', sourceSymbol: 'I:SPX' });
    expect(providerSupport(market('AAPL'))).toMatchObject({ supported: true, provider: 'massive', sourceSymbol: 'AAPL' });
  });

  it('reports instruments without an adapter as unsupported instead of inventing a mapping', () => {
    const jp225 = market('JP225');
    expect(providerAdapterFor(jp225.provider)).toBeNull();
    expect(providerSupport(jp225)).toMatchObject({ supported: false, sourceSymbol: null });
    expect(providerSupport(jp225).reason).toContain('No market-data adapter');
    expect(isProviderSupportedMarket(jp225)).toBe(false);
    expect(resolveSourceSymbol(jp225)).toBeNull();
  });

  it('never guesses an index ticker when the registry has no source mapping', () => {
    const index = { ...market('SPX500'), sourceSymbol: undefined };
    expect(resolveSourceSymbol(index)).toBeNull();
    expect(providerSupport(index).supported).toBe(false);
  });
});

describe('instrument-specific trading capabilities', () => {
  it('derives price precision and tick size per asset class', () => {
    expect(pricePrecision(market('EURUSD'))).toBe(5);
    expect(pricePrecision(market('USDJPY'))).toBe(3);
    expect(pricePrecision(market('AAPL'))).toBe(2);
    expect(tickSize(market('EURUSD'))).toBeCloseTo(0.00001, 10);
    expect(contractSize(market('SPX500'))).toBe(1);
  });

  it('uses continuous sessions for crypto and exchange calendars elsewhere', () => {
    expect(marketSessionModel(market('BTCUSD'))).toBe('continuous');
    expect(marketSessionModel(market('XAUUSD'))).toBe('exchange-calendar');
    expect(marketSessionModel(market('AAPL'))).toBe('exchange-calendar');
  });

  it('limits paper eligibility to USD-settled instruments with a provider adapter', () => {
    expect(settlementCurrency(market('USDJPY'))).toBe('JPY');
    expect(paperSettlementEligible(market('BTCUSD'))).toBe(true);
    expect(paperSettlementEligible(market('AAPL'))).toBe(true);
    expect(paperSettlementEligible(market('SPX500'))).toBe(true);
    expect(paperSettlementEligible(market('XAUUSD'))).toBe(true);
    expect(paperSettlementEligible(market('EURUSD'))).toBe(true);
    expect(paperSettlementEligible(market('USDJPY'))).toBe(false);
    expect(paperSettlementEligible(market('EURJPY'))).toBe(false);
    expect(paperSettlementEligible(market('GER40'))).toBe(false);
    expect(paperSettlementEligible(market('JP225'))).toBe(false);
    expect(paperEligibilityReason(market('JP225'))).toContain('No market-data adapter');
    expect(paperEligibilityReason(market('EURJPY'))).toContain('settles in JPY');
  });

  it('keeps short entries disabled unless the instrument declares shortability', () => {
    expect(supportsPlanSide(market('BTCUSD'), 'long')).toBe(true);
    expect(supportsPlanSide(market('BTCUSD'), 'short')).toBe(false);
    expect(supportsPlanSide({ ...market('AAPL'), shortable: true }, 'short')).toBe(true);
  });
});
