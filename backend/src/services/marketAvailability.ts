// Holds server-side provider-verification state for registry instruments with existing adapters.
import { MARKET_UNIVERSE } from '../../../src/lib/markets';
import type { MarketDataProvider, Timeframe } from '../../../src/lib/types';
import { config } from '../config';
import { traderConfig } from '../trader/config';
import { MarketDataProviderError, probeMarketData } from './marketDataService';

export type AvailabilityStatus = 'verified' | 'partially_verified' | 'unverified' | 'unavailable' | 'stale' | 'error';
export type AvailabilityProvider = MarketDataProvider | 'unsupported';
export interface TimeframeProbeResult {
  timeframe: Timeframe;
  status: AvailabilityStatus;
  testType?: 'provider_probe' | 'chart_request';
  environment?: 'test' | 'production';
  checkedAt?: number;
  candleCount?: number;
  closedCandleCount?: number;
  latestClosedCandleAt?: string | null;
  ageMs?: number | null;
  errorCategory?: string;
  reason?: string;
}
export interface MarketAvailability { symbol: string; provider: AvailabilityProvider; sourceInstrument: string; status: AvailabilityStatus; checkedAt: number | null; reason?: string; timeframes?: TimeframeProbeResult[] }

export function marketProbeSpacingMs(
  requestsPerWindow = config.massiveRequestsPerWindow,
  windowMs = config.massiveBudgetWindowMs,
  reservedPriorityRequests = config.massiveTraderReservedRequests,
  minimumIntervalMs = config.marketProbeIntervalMs,
): number {
  const reserved = Math.min(reservedPriorityRequests, Math.max(0, requestsPerWindow - 1));
  const standardRequestSlots = Math.max(1, requestsPerWindow - reserved);
  return Math.max(minimumIntervalMs, Math.ceil(windowMs / standardRequestSlots));
}

const supportedMarkets = MARKET_UNIVERSE.filter((market) => market.isActive
  && (market.provider === 'massive' || market.provider === 'twelvedata'));
const probeableMarkets = supportedMarkets.filter((market) => ['crypto', 'commodity'].includes(market.marketType)
  && (market.provider === 'twelvedata'
    ? Boolean(market.sourceSymbol || (market.baseAsset && market.quoteAsset))
    : Boolean(market.sourceSymbol)));
export function getProbeableMarketSymbols(): string[] {
  return probeableMarkets.map((market) => market.symbol);
}

export function isProbeableMarket(symbol: string): boolean {
  return probeableMarkets.some((market) => market.symbol === symbol);
}
const requiredTimeframes = [...new Set<Timeframe>([
  ...traderConfig.HTF_TIMEFRAMES as Timeframe[],
  traderConfig.SETUP_TIMEFRAME as Timeframe,
  ...traderConfig.TRIGGER_TIMEFRAMES as Timeframe[],
  traderConfig.MGMT_TIMEFRAME as Timeframe,
])];
const statuses = new Map<string, MarketAvailability>(MARKET_UNIVERSE.filter((market) => market.isActive).map((market) => [market.symbol, {
  symbol: market.symbol,
  provider: market.provider === 'massive' || market.provider === 'twelvedata' ? market.provider : 'unsupported',
  sourceInstrument: market.sourceSymbol ?? (market.provider === 'twelvedata'
    ? `${market.baseAsset}/${market.quoteAsset}` : market.symbol),
  status: 'unverified',
  checkedAt: null,
  reason: market.provider === 'massive' || market.provider === 'twelvedata' ? 'No successful provider check has been recorded in this backend process.' : `No shared candle adapter is configured for ${market.provider}.`,
}]));
let probeInProgress: Promise<MarketAvailability[]> | null = null;
const lastTierBScans = new Map<string, number>();

export class MarketProbeInProgressError extends Error {
  constructor() {
    super('Another market availability probe is already running.');
    this.name = 'MarketProbeInProgressError';
  }
}

export function recordTierBScan(symbol: string, timeframe: '1h' | '4h', checkedAt = Date.now()): void {
  lastTierBScans.set(`${symbol}:${timeframe}`, checkedAt);
}

export function getTierBLastScannedAt(symbol: string): number | null {
  return [...lastTierBScans.entries()].filter(([key]) => key.startsWith(`${symbol}:`))
    .reduce<number | null>((latest, [, checkedAt]) => latest === null ? checkedAt : Math.max(latest, checkedAt), null);
}

export function getTierBTimeframeLastScannedAt(symbol: string, timeframe: '1h' | '4h'): number | null {
  return lastTierBScans.get(`${symbol}:${timeframe}`) ?? null;
}

function providerProbeSpacingMs(provider: MarketDataProvider): number {
  if (provider === 'massive') return marketProbeSpacingMs();
  return Math.max(config.marketProbeIntervalMs, Math.ceil(config.twelveDataBudgetWindowMs / config.twelveDataRequestsPerWindow));
}

export function getMarketAvailability(): MarketAvailability[] {
  return [...statuses.values()].map((status) => ({
    ...status,
    timeframes: status.timeframes?.map((result) => ({ ...result })),
  }));
}

function aggregateAvailability(timeframes: TimeframeProbeResult[]): AvailabilityStatus {
  if (!timeframes.length) return 'unverified';
  if (requiredTimeframes.every((required) => timeframes.some((result) => result.timeframe === required && result.status === 'verified'))) return 'verified';
  if (timeframes.some((result) => result.status === 'verified' || result.status === 'partially_verified')) return 'partially_verified';
  if (requiredTimeframes.every((required) => timeframes.some((result) => result.timeframe === required && result.status === 'unavailable'))) return 'unavailable';
  if (timeframes.some((result) => result.status === 'error')) return 'error';
  if (timeframes.some((result) => result.status === 'stale')) return 'stale';
  if (timeframes.some((result) => result.status === 'unavailable')) return 'partially_verified';
  return 'unverified';
}

// Record successful chart/backtest checks per timeframe without treating one request as full validation.
export function recordProviderTimeframeAvailability(
  symbol: string,
  timeframe: Timeframe,
  candleCount: number,
  closedCandleCount: number,
  latestClosedCandleAt: string | null,
  ageMs: number | null,
  stale: boolean,
): void {
  const current = statuses.get(symbol);
  if (!current || current.provider === 'unsupported') return;
  const status: AvailabilityStatus = stale ? 'stale' : closedCandleCount >= 50 ? 'verified' : candleCount > 0 ? 'partially_verified' : 'unverified';
  const timeframeResult: TimeframeProbeResult = {
    timeframe,
    status,
    testType: 'chart_request',
    environment: config.appEnvironment,
    checkedAt: Date.now(),
    candleCount,
    closedCandleCount,
    latestClosedCandleAt,
    ageMs,
    reason: status === 'stale' ? 'Latest closed candle exceeds the configured freshness threshold.'
      : status === 'partially_verified' ? `Only ${closedCandleCount} closed candles were returned; 50 are required.`
        : status === 'unverified' ? 'No valid candles were returned.' : undefined,
  };
  const timeframes = [...(current.timeframes ?? []).filter((result) => result.timeframe !== timeframe), timeframeResult];
  const aggregateStatus = aggregateAvailability(timeframes);
  statuses.set(symbol, {
    ...current,
    status: aggregateStatus,
    checkedAt: Date.now(),
    reason: aggregateStatus === 'verified' ? undefined
      : aggregateStatus === 'unavailable' ? 'Provider reports this instrument or a checked timeframe unavailable.'
        : aggregateStatus === 'partially_verified' ? 'Some required timeframes are verified; others still need checks.'
          : aggregateStatus === 'stale' ? 'Latest checked market data is stale.'
            : aggregateStatus === 'error' ? 'Provider checks failed; retry after resolving the reported errors.'
              : 'Provider data has not been verified on every required timeframe.',
    timeframes,
  });
}

// Convert a confirmed provider 404 into an explicit unavailable state.
export function recordProviderUnavailable(symbol: string, timeframe: Timeframe): void {
  const current = statuses.get(symbol);
  if (!current) return;
  const timeframes = [
    ...(current.timeframes ?? []).filter((result) => result.timeframe !== timeframe),
    { timeframe, testType: 'chart_request' as const, environment: config.appEnvironment, status: 'unavailable' as const, checkedAt: Date.now(), reason: 'Provider reports this instrument or timeframe is unavailable.' },
  ];
  const status = aggregateAvailability(timeframes);
  statuses.set(symbol, {
    ...current,
    status,
    checkedAt: Date.now(),
    reason: status === 'unavailable' ? 'Provider reports this instrument or timeframe unavailable.'
      : status === 'partially_verified' ? 'Some required timeframes are verified; others still need checks.'
        : current.reason,
    timeframes,
  });
}

export function recordProviderTimeframeError(symbol: string, timeframe: Timeframe, errorCategory: string): void {
  const current = statuses.get(symbol);
  if (!current || current.provider === 'unsupported') return;
  const timeframes = [
    ...(current.timeframes ?? []).filter((result) => result.timeframe !== timeframe),
    { timeframe, testType: 'chart_request' as const, environment: config.appEnvironment, status: 'error' as const, checkedAt: Date.now(), errorCategory, reason: `Provider check failed (${errorCategory}).` },
  ];
  const aggregateStatus = aggregateAvailability(timeframes);
  statuses.set(symbol, {
    ...current,
    status: aggregateStatus,
    checkedAt: Date.now(),
    reason: aggregateStatus === 'partially_verified'
      ? 'Some required timeframes are verified; others still need checks.'
      : aggregateStatus === 'error' ? 'Provider checks failed; retry after resolving the reported errors.'
        : current.reason,
    timeframes,
  });
}

// Restore unknown-by-default process state between isolated availability tests.
export function resetMarketAvailabilityForTests(): void {
  for (const market of MARKET_UNIVERSE.filter((instrument) => instrument.isActive)) {
    const current = statuses.get(market.symbol)!;
    statuses.set(market.symbol, { ...current, status: 'unverified', checkedAt: null, timeframes: undefined,
      reason: current.provider === 'unsupported' ? `No shared candle adapter is configured for ${market.provider}.` : 'No successful provider check has been recorded in this backend process.' });
  }
}

export async function probeAllMarkets(
  symbols: readonly string[],
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<MarketAvailability[]> {
  if (probeInProgress) throw new MarketProbeInProgressError();
  const configuredMarkets = probeableMarkets.filter((market) => symbols.includes(market.symbol));
  probeInProgress = (async () => {
    let hasRequested = false;
    for (const market of configuredMarkets) {
      const timeframes: TimeframeProbeResult[] = [];
      for (const timeframe of requiredTimeframes) {
        if (hasRequested) await sleep(providerProbeSpacingMs(market.provider as MarketDataProvider));
        hasRequested = true;
        try {
          const result = await probeMarketData(market.symbol, timeframe, 60);
          const enoughClosed = result.closedCandleCount >= 50;
          const fresh = !result.stale;
          timeframes.push({
            timeframe,
            status: !fresh ? 'stale' : enoughClosed ? 'verified' : result.candleCount > 0 ? 'partially_verified' : 'unverified',
            testType: 'provider_probe',
            environment: config.appEnvironment,
            checkedAt: Date.now(),
            candleCount: result.candleCount,
            closedCandleCount: result.closedCandleCount,
            latestClosedCandleAt: result.latestClosedCandleAt,
            ageMs: result.ageMs,
            reason: !fresh ? 'Latest closed candle exceeds the configured freshness threshold.'
              : !enoughClosed ? `Only ${result.closedCandleCount} closed candles were returned; 50 are required.` : undefined,
          });
        } catch (error) {
          const isMissing = error instanceof MarketDataProviderError && error.status === 404;
          const errorCategory = error instanceof MarketDataProviderError && error.status === 429 ? 'rate-limited'
            : error instanceof Error && /timeout|timed out/i.test(error.message) ? 'timeout'
              : error instanceof Error && /returned no candles|empty or invalid/i.test(error.message) ? 'invalid-or-empty-data'
                : 'provider-or-validation-error';
          timeframes.push({
            timeframe,
            status: isMissing ? 'unavailable' : 'error',
            testType: 'provider_probe',
            environment: config.appEnvironment,
            checkedAt: Date.now(),
            errorCategory: isMissing ? undefined : errorCategory,
            reason: isMissing ? 'Provider reports this instrument or timeframe is unavailable.' : `Provider check failed (${errorCategory}).`,
          });
        }
      }
      const status = aggregateAvailability(timeframes);
      statuses.set(market.symbol, {
        symbol: market.symbol,
        provider: market.provider as MarketDataProvider,
        sourceInstrument: market.sourceSymbol ?? `${market.baseAsset}/${market.quoteAsset}`,
        status,
        checkedAt: Date.now(),
        reason: status === 'verified' ? undefined
          : status === 'unavailable' ? 'Provider reports this instrument or timeframe unavailable.'
            : status === 'partially_verified' ? 'Some required timeframes are verified; others still need checks.'
              : status === 'stale' ? 'Latest checked market data is stale.'
                : status === 'error' ? 'Provider checks failed; retry after resolving the reported errors.'
                  : 'One or more required timeframes could not be verified.',
        timeframes,
      });
    }
    return getMarketAvailability();
  })().finally(() => { probeInProgress = null; });
  return probeInProgress;
}
