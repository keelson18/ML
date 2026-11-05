import { describe, expect, it } from 'vitest';
import { selectVerifiedPlannerMarkets } from './trader';

describe('verified planner market selection', () => {
  it('allows selected active supported USD-settled markets with verified availability', () => {
    const markets = selectVerifiedPlannerMarkets(['BTCUSD', 'ETHUSD', 'ADAUSD', 'DOGEUSD'], [
      { symbol: 'BTCUSD', provider: 'twelvedata', sourceInstrument: 'BTC/USD', status: 'unverified', checkedAt: null },
      { symbol: 'ETHUSD', provider: 'massive', sourceInstrument: 'X:ETHUSD', status: 'verified', checkedAt: 1 },
      { symbol: 'ADAUSD', provider: 'massive', sourceInstrument: 'X:ADAUSD', status: 'unavailable', checkedAt: 1 },
      { symbol: 'DOGEUSD', provider: 'massive', sourceInstrument: 'X:DOGEUSD', status: 'verified', checkedAt: 1 },
    ]);

    expect(markets.map((market) => market.symbol)).toEqual(['ETHUSD', 'DOGEUSD']);
  });

  it('accepts a configured Twelve Data USD crypto market after timeframe verification', () => {
    const markets = selectVerifiedPlannerMarkets(['BTCUSD'], [
      { symbol: 'BTCUSD', provider: 'twelvedata', sourceInstrument: 'BTC/USD', status: 'verified', checkedAt: 1 },
    ]);
    expect(markets.map((market) => market.symbol)).toEqual(['BTCUSD']);
  });

  it('blocks every market until verification has produced an available status', () => {
    expect(selectVerifiedPlannerMarkets(['BTCUSD', 'ETHUSD'], [])).toEqual([]);
  });

  it('accepts verified stocks, indices, commodities and USD forex pairs but not non-USD settlement', () => {
    const verified = (symbol: string) => ({ symbol, provider: 'massive' as const, sourceInstrument: symbol, status: 'verified' as const, checkedAt: 1 });
    const markets = selectVerifiedPlannerMarkets(
      ['AAPL', 'SPX500', 'XAUUSD', 'EURUSD', 'USDJPY', 'GER40', 'JP225'],
      [verified('AAPL'), { ...verified('SPX500'), provider: 'massive' }, { ...verified('XAUUSD'), provider: 'twelvedata' },
        { ...verified('EURUSD'), provider: 'twelvedata' }, { ...verified('USDJPY'), provider: 'twelvedata' },
        { ...verified('GER40'), provider: 'massive' }, { ...verified('JP225'), provider: 'unsupported' }],
    );
    expect(new Set(markets.map((market) => market.symbol))).toEqual(new Set(['AAPL', 'SPX500', 'XAUUSD', 'EURUSD']));
  });

  it('does not allow a verified market outside the account selection', () => {
    expect(selectVerifiedPlannerMarkets(['BTCUSD'], [
      { symbol: 'BTCUSD', provider: 'twelvedata', sourceInstrument: 'BTC/USD', status: 'verified', checkedAt: 1 },
      { symbol: 'ETHUSD', provider: 'massive', sourceInstrument: 'X:ETHUSD', status: 'verified', checkedAt: 1 },
    ]).map((market) => market.symbol)).toEqual(['BTCUSD']);
  });
});
