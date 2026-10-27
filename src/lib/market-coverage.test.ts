// Coverage contracts keep registry defaults and provider-budget admission explicit.
import { afterEach, describe, expect, it } from 'vitest';
import { MARKET_UNIVERSE, setMarketAvailability } from './markets';
import { canFetchHistoricalMarketData, canTierBScanWithBudget, getMarketCoverageTable, marketCoverageAllowsFetch, setMarketCoverageOverrides } from './market-coverage';

describe('market coverage', () => {
  afterEach(() => {
    setMarketCoverageOverrides([]);
    setMarketAvailability(MARKET_UNIVERSE.map(({ symbol }) => ({ symbol, status: 'unverified', checkedAt: null })));
  });

  it('assigns every active registry instrument a visible tier and reason', () => {
    const coverage = getMarketCoverageTable();
    expect(coverage).toHaveLength(MARKET_UNIVERSE.filter((market) => market.isActive).length);
    expect(coverage.every((market) => market.tier && market.label && market.reason.trim().length > 0)).toBe(true);
  });

  it('does not assign autopilot to instruments merely because they are in the registry', () => {
    const coverage = getMarketCoverageTable();
    expect(coverage.filter(({ tier }) => tier === 'A').map(({ symbol }) => symbol).sort()).toEqual(['BTCUSD', 'ETHUSD', 'SOLUSD']);
    expect(coverage.find(({ symbol }) => symbol === 'XAUUSD')?.tier).toBe('blocked');
  });

  it('marks confirmed provider unavailability as Blocked even when an override exists', () => {
    const gold = MARKET_UNIVERSE.find((market) => market.symbol === 'XAUUSD')!;
    setMarketCoverageOverrides([{ symbol: gold.symbol, tier: 'C', reason: 'on demand', providerMappingVerified: true, sessionCalendarVerified: true }]);
    setMarketAvailability([{ symbol: gold.symbol, status: 'unavailable', checkedAt: Date.now() }]);
    expect(getMarketCoverageTable().find(({ symbol }) => symbol === gold.symbol)).toMatchObject({ tier: 'blocked', label: 'Blocked' });
  });

  it('blocks Tier B scans when either provider reserve would be spent', () => {
    expect(canTierBScanWithBudget({ standardRemaining: 0, standardDailyRemaining: 40 })).toBe(false);
    expect(canTierBScanWithBudget({ standardRemaining: 2, standardDailyRemaining: 0 })).toBe(false);
    expect(canTierBScanWithBudget({ standardRemaining: 2, standardDailyRemaining: 40 })).toBe(true);
    expect(canTierBScanWithBudget({ standardRemaining: 2, standardDailyRemaining: null })).toBe(true);
  });

  it('allows on-demand fetches only for an explicitly enabled coverage tier', () => {
    expect(marketCoverageAllowsFetch('C')).toBe(true);
    expect(marketCoverageAllowsFetch('blocked')).toBe(false);
  });

  it('allows provider-validated read-only history without promoting blocked instruments', () => {
    const gold = MARKET_UNIVERSE.find((market) => market.symbol === 'XAUUSD')!;
    const unsupported = MARKET_UNIVERSE.find((market) => market.symbol === 'JP225')!;
    expect(canFetchHistoricalMarketData(gold, false)).toBe(true);
    expect(canFetchHistoricalMarketData(gold, true)).toBe(false);
    expect(canFetchHistoricalMarketData(unsupported, false)).toBe(false);
    expect(getMarketCoverageTable().find(({ symbol }) => symbol === 'XAUUSD')?.tier).toBe('blocked');
  });
});
