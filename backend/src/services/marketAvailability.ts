import { MARKET_UNIVERSE } from '../../../src/lib/markets';
import { marketsVerifiedOverride, config } from '../config';
import { MarketDataProviderError, probeMarketData } from './marketDataService';

export type AvailabilityStatus = 'available' | 'unavailable' | 'unverified';
export interface MarketAvailability { symbol: string; status: AvailabilityStatus; checkedAt: number | null; candleCount?: number }

const massiveCrypto = MARKET_UNIVERSE.filter((market) => market.isActive && market.marketType === 'crypto' && market.provider === 'massive');
const statuses = new Map<string, MarketAvailability>(massiveCrypto.map(({ symbol }) => [symbol, {
  symbol,
  status: marketsVerifiedOverride.includes(symbol) ? 'available' : 'unverified',
  checkedAt: null,
}]));
let probeInProgress: Promise<MarketAvailability[]> | null = null;

export function getMarketAvailability(): MarketAvailability[] {
  return [...statuses.values()].map((status) => ({ ...status }));
}

export async function probeAllMarkets(): Promise<MarketAvailability[]> {
  if (probeInProgress) return probeInProgress;
  probeInProgress = (async () => {
    for (const market of massiveCrypto) {
      const checkedAt = Date.now();
      try {
        const { candleCount } = await probeMarketData(market.symbol);
        statuses.set(market.symbol, { symbol: market.symbol, status: 'available', checkedAt, candleCount });
      } catch (error) {
        const previous = statuses.get(market.symbol)!;
        if (error instanceof MarketDataProviderError && error.status === 404) {
          statuses.set(market.symbol, { symbol: market.symbol, status: 'unavailable', checkedAt });
        } else {
          statuses.set(market.symbol, { ...previous, status: 'unverified', checkedAt });
        }
      }
      if (market !== massiveCrypto.at(-1)) await new Promise((resolve) => setTimeout(resolve, config.marketProbeIntervalMs));
    }
    return getMarketAvailability();
  })().finally(() => { probeInProgress = null; });
  return probeInProgress;
}
