// Holds server-side verification state for active, supported USD crypto markets.
import { MARKET_UNIVERSE } from '../../../src/lib/markets';
import type { MarketDataProvider, Timeframe } from '../../../src/lib/types';
import { autonomySymbols, config } from '../config';
import { traderConfig } from '../trader/config';
import { MarketDataProviderError, probeMarketData } from './marketDataService';

export type AvailabilityStatus = 'available' | 'unavailable' | 'unverified';
export interface TimeframeProbeResult {
  timeframe: Timeframe;
  status: AvailabilityStatus;
  candleCount?: number;
  closedCandleCount?: number;
  latestClosedCandleAt?: string | null;
  ageMs?: number | null;
  reason?: string;
}
export interface MarketAvailability { symbol: string; provider: MarketDataProvider; sourceInstrument: string; status: AvailabilityStatus; checkedAt: number | null; timeframes?: TimeframeProbeResult[] }

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

const supportedCrypto = MARKET_UNIVERSE.filter((market) => market.isActive && market.marketType === 'crypto'
  && market.priceCurrency === 'USD' && (market.provider === 'massive' || market.provider === 'twelvedata') && market.sourceSymbol);
const requiredTimeframes = [...new Set<Timeframe>([
  ...traderConfig.HTF_TIMEFRAMES as Timeframe[],
  traderConfig.SETUP_TIMEFRAME as Timeframe,
  ...traderConfig.TRIGGER_TIMEFRAMES as Timeframe[],
  traderConfig.MGMT_TIMEFRAME as Timeframe,
])];
const statuses = new Map<string, MarketAvailability>(supportedCrypto.map(({ symbol, provider, sourceSymbol }) => [symbol, {
  symbol,
  provider: provider as MarketDataProvider,
  sourceInstrument: sourceSymbol!,
  status: 'unverified',
  checkedAt: null,
}]));
let probeInProgress: Promise<MarketAvailability[]> | null = null;

function providerProbeSpacingMs(provider: MarketDataProvider): number {
  if (provider === 'massive') return marketProbeSpacingMs();
  return Math.max(config.marketProbeIntervalMs, Math.ceil(config.twelveDataBudgetWindowMs / config.twelveDataRequestsPerWindow));
}

export function getMarketAvailability(): MarketAvailability[] {
  return [...statuses.values()].map((status) => ({ ...status }));
}

export async function probeAllMarkets(
  symbols: readonly string[] = autonomySymbols,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<MarketAvailability[]> {
  if (probeInProgress) return probeInProgress;
  const configuredMarkets = supportedCrypto.filter((market) => symbols.includes(market.symbol));
  probeInProgress = (async () => {
    let hasRequested = false;
    for (const market of configuredMarkets) {
      const checkedAt = Date.now();
      const timeframes: TimeframeProbeResult[] = [];
      let unavailable = false;
      for (const timeframe of requiredTimeframes) {
        if (hasRequested) await sleep(providerProbeSpacingMs(market.provider as MarketDataProvider));
        hasRequested = true;
        try {
          const result = await probeMarketData(market.symbol, timeframe, 60);
          const enoughClosed = result.closedCandleCount >= 50;
          const fresh = !result.stale;
          timeframes.push({
            timeframe,
            status: enoughClosed && fresh ? 'available' : 'unverified',
            candleCount: result.candleCount,
            closedCandleCount: result.closedCandleCount,
            latestClosedCandleAt: result.latestClosedCandleAt,
            ageMs: result.ageMs,
            reason: !enoughClosed ? 'Fewer than 50 closed candles were returned.' : !fresh ? 'Latest closed candle exceeds the configured freshness threshold.' : undefined,
          });
        } catch (error) {
          const isMissing = error instanceof MarketDataProviderError && error.status === 404;
          unavailable ||= isMissing;
          timeframes.push({ timeframe, status: isMissing ? 'unavailable' : 'unverified', reason: isMissing ? 'Provider reports this instrument or timeframe is unavailable.' : 'Provider request failed or returned invalid data.' });
        }
      }
      const status: AvailabilityStatus = unavailable ? 'unavailable' : timeframes.every((result) => result.status === 'available') ? 'available' : 'unverified';
      statuses.set(market.symbol, { symbol: market.symbol, provider: market.provider as MarketDataProvider, sourceInstrument: market.sourceSymbol!, status, checkedAt, timeframes });
    }
    return getMarketAvailability();
  })().finally(() => { probeInProgress = null; });
  return probeInProgress;
}
