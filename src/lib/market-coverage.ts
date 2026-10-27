import { MARKET_UNIVERSE, getMarketAvailability } from './markets';
import type { Market } from './types';

export type MarketCoverageTier = 'A' | 'B' | 'C' | 'blocked';
export type MarketCoverageLabel = 'Autopilot' | 'Scanning' | 'On-demand' | 'Blocked';

export interface MarketCoverage {
  symbol: string;
  tier: MarketCoverageTier;
  label: MarketCoverageLabel;
  reason: string;
  lastScannedAt: number | null;
}

export interface MarketCoverageOverride {
  symbol: string;
  tier: MarketCoverageTier;
  reason: string;
  providerMappingVerified: boolean;
  sessionCalendarVerified: boolean;
  lastScannedAt?: number | null;
}

// Tier A is an explicit owner-selected starter set; registry membership never enrolls a market.
export const DEFAULT_TIER_A_SYMBOLS = ['BTCUSD', 'ETHUSD', 'SOLUSD'] as const;
let coverageOverrides = new Map<string, MarketCoverageOverride>();

export function setMarketCoverageOverrides(overrides: MarketCoverageOverride[]): void {
  coverageOverrides = new Map(overrides.map((override) => [override.symbol, override]));
}

// Read-only history may be fetched for provider-backed instruments so the response
// itself can verify the mapping; this never changes an automation coverage tier.
export function canFetchHistoricalMarketData(market: Market, explicitlyBlocked: boolean): boolean {
  if (explicitlyBlocked) return false;
  if (market.provider === 'massive') return Boolean(market.sourceSymbol);
  if (market.provider === 'twelvedata') return Boolean(market.sourceSymbol || (market.baseAsset && market.quoteAsset));
  return false;
}

export function hasMarketCoverageOverride(symbol: string): boolean {
  return coverageOverrides.has(symbol);
}

function isCryptoUsd(market: Market): boolean {
  return market.marketType === 'crypto' && market.priceCurrency === 'USD'
    && (market.provider === 'massive' || market.provider === 'twelvedata')
    && Boolean(market.sourceSymbol);
}

export function getMarketCoverage(market: Market, availability = getMarketAvailability(market.symbol), override?: MarketCoverageOverride): MarketCoverage {
  if (availability.status === 'unavailable') return { symbol: market.symbol, tier: 'blocked', label: 'Blocked', reason: 'Provider reports this instrument unavailable.', lastScannedAt: availability.checkedAt };
  override ??= coverageOverrides.get(market.symbol);
  if (override) return { symbol: market.symbol, tier: override.tier,
    label: override.tier === 'A' ? 'Autopilot' : override.tier === 'B' ? 'Scanning' : override.tier === 'C' ? 'On-demand' : 'Blocked',
    reason: override.reason || 'Coverage configured by an administrator.', lastScannedAt: override.lastScannedAt ?? availability.checkedAt };
  if (DEFAULT_TIER_A_SYMBOLS.includes(market.symbol as typeof DEFAULT_TIER_A_SYMBOLS[number])) {
    return { symbol: market.symbol, tier: 'A', label: 'Autopilot', reason: availability.status === 'verified'
      ? 'Eligible for per-user paper autopilot; enrollment remains opt-in and capped.'
      : `Provider availability is ${availability.status}; autopilot entries remain blocked until verified.`, lastScannedAt: availability.checkedAt };
  }
  if (market.symbol === 'POLUSD' && availability.status !== 'verified') {
    return { symbol: market.symbol, tier: 'blocked', label: 'Blocked', reason: 'POL/USD remains blocked until provider availability is verified.', lastScannedAt: availability.checkedAt };
  }
  if (isCryptoUsd(market)) {
    return { symbol: market.symbol, tier: 'B', label: 'Scanning', reason: availability.checkedAt === null
      ? 'Provider mapping is unverified; exploratory budget-limited scans cannot open paper trades.'
      : 'Budget-limited crypto scan coverage; scans cannot open paper trades.', lastScannedAt: availability.checkedAt };
  }
  return { symbol: market.symbol, tier: 'blocked', label: 'Blocked', reason: market.marketType === 'commodity'
    ? 'Provider availability and the instrument session calendar are unverified.'
    : !market.sourceSymbol ? 'Provider instrument mapping is unverified.' : 'Instrument session calendar and provider availability are unverified.', lastScannedAt: null };
}

export function getMarketCoverageTable(): MarketCoverage[] {
  return MARKET_UNIVERSE.filter((market) => market.isActive).map((market) => getMarketCoverage(market));
}

// Tier B work is admitted only when both the rolling-minute share and daily share remain.
export function canTierBScanWithBudget(budget: { standardRemaining: number; standardDailyRemaining: number | null }): boolean {
  return budget.standardRemaining > 0 && (budget.standardDailyRemaining === null || budget.standardDailyRemaining > 0);
}

// Only an explicit blocked tier forbids provider access; Tier C is fetched on user demand.
export function marketCoverageAllowsFetch(tier: MarketCoverageTier): boolean {
  return tier !== 'blocked';
}
