// Covers trader configuration defaults, environment overrides, and invalid values.
import { describe, expect, it } from 'vitest';
import { parseTraderConfig } from './config';

describe('trader configuration', () => {
  it('parses the recommended trader defaults', () => {
    const config = parseTraderConfig({});
    expect(config).toMatchObject({
      TRADER_STARTING_EQUITY: 100_000,
      RISK_PER_TRADE_PCT: 0.5,
      MAX_PORTFOLIO_HEAT_PCT: 2,
      MIN_RR: 2,
      HTF_TIMEFRAMES: ['4h', '1d'],
      SETUP_TIMEFRAME: '1h',
      TRIGGER_TIMEFRAMES: ['15m', '1h'],
      MGMT_TIMEFRAME: '5m',
      SETUP_EXPIRY_BARS: 3,
      ALLOWED_GRADES: ['A', 'B'],
      ALLOWED_SETUP_TYPES: ['trend-pullback'],
      PROMOTED_SETUP_TYPES: [],
      STALE_DATA_BLOCKS_ENTRIES: true,
    });
  });

  it('keeps autopilot symbol caps out of environment config so the database is the single cap source', () => {
    const parsed = parseTraderConfig({ AUTOPILOT_MAX_SYMBOLS_PER_USER: '99' });
    expect(parsed).not.toHaveProperty('AUTOPILOT_MAX_SYMBOLS_PER_USER');
  });

  it('only accepts promoted setup names from the configured setup registry', () => {
    expect(parseTraderConfig({ PROMOTED_SETUP_TYPES: 'trend-pullback' }).PROMOTED_SETUP_TYPES).toEqual(['trend-pullback']);
    expect(() => parseTraderConfig({ PROMOTED_SETUP_TYPES: 'unregistered-setup' })).toThrow('PROMOTED_SETUP_TYPES has an invalid trader configuration value.');
  });

  it('accepts valid environment overrides and rejects unsafe bounds', () => {
    expect(parseTraderConfig({ TRADER_STARTING_EQUITY: '50000', ALLOWED_GRADES: 'A', STALE_DATA_BLOCKS_ENTRIES: 'false' }))
      .toMatchObject({ TRADER_STARTING_EQUITY: 50_000, ALLOWED_GRADES: ['A'], STALE_DATA_BLOCKS_ENTRIES: false });
    expect(() => parseTraderConfig({ RISK_PER_TRADE_PCT: '0' })).toThrow('RISK_PER_TRADE_PCT has an invalid trader configuration value.');
    expect(() => parseTraderConfig({ HTF_TIMEFRAMES: '2m' })).toThrow('HTF_TIMEFRAMES has an invalid trader configuration value.');
    expect(() => parseTraderConfig({ TRIGGER_TIMEFRAMES: '1h,15m' })).toThrow('TRIGGER_TIMEFRAMES has an invalid trader configuration value.');
  });
});
