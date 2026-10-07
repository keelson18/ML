// Verifies crypto stays 24/7 and configured exchange calendars block closed windows.
import { describe, expect, it } from 'vitest';
import { MARKET_UNIVERSE } from '../../../src/lib/markets';
import { evaluateMarketSession } from './sessions';

const crypto = MARKET_UNIVERSE.find((market) => market.symbol === 'BTCUSD')!;
const stock = MARKET_UNIVERSE.find((market) => market.symbol === 'AAPL')!;
const calendar = {
  NASDAQ: {
    timezone: 'UTC', open: '09:00', close: '17:00', weekdays: [1, 2, 3, 4, 5], holidays: ['2026-10-05'],
    openAuctionBlackoutMinutes: 10, closeAuctionBlackoutMinutes: 10, scoreMultiplier: 0.9,
  },
};

describe('market session policy', () => {
  it('keeps crypto open around the clock without a kill zone penalty', () => {
    const result = evaluateMarketSession(crypto, Date.parse('2026-10-04T03:00:00Z'));
    expect(result).toMatchObject({ allowed: true, scoreMultiplier: 1 });
  });

  it('blocks a non-crypto market when no exchange calendar is configured', () => {
    expect(evaluateMarketSession(stock, Date.parse('2026-10-07T12:00:00Z')).allowed).toBe(false);
  });

  it('honors configured weekday hours, auction blackouts, and holidays', () => {
    const preOpen = evaluateMarketSession(stock, Date.parse('2026-10-07T09:05:00Z'), calendar);
    const open = evaluateMarketSession(stock, Date.parse('2026-10-07T09:15:00Z'), calendar);
    const holiday = evaluateMarketSession(stock, Date.parse('2026-10-05T10:00:00Z'), calendar);
    expect(preOpen).toMatchObject({ allowed: false, reason: 'Opening auction blackout is active.' });
    expect(open).toMatchObject({ allowed: true, scoreMultiplier: 0.9 });
    expect(holiday.allowed).toBe(false);
  });
});
