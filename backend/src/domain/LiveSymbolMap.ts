import { MARKET_UNIVERSE } from '../../../src/lib/markets';
import { providerAdapterFor, resolveSourceSymbol } from '../../../src/lib/marketCapabilities';
import type { Market } from '../../../src/lib/types';

// Lives outside src/live so config validation can use it without pulling streaming code into trader/engines.
// Mappings are derived from the registry's assigned provider; a market is never indexed for a
// provider it is not configured to use.

function coinbaseProductFor(market: Market): string | undefined {
  if (market.marketType !== 'crypto' || market.quoteAsset !== 'USD') return undefined;
  return `${market.baseAsset}-USD`;
}

function twelveDataSymbolFor(market: Market): string | undefined {
  if (providerAdapterFor(market.provider) !== 'twelvedata') return undefined;
  return resolveSourceSymbol(market) ?? undefined;
}

interface SymbolIndex {
  toProvider: Map<string, string>;
  toInternal: Map<string, string>;
}

function buildIndex(providerSymbolFor: (market: Market) => string | undefined): SymbolIndex {
  const toProvider = new Map<string, string>();
  const toInternal = new Map<string, string>();
  for (const market of MARKET_UNIVERSE) {
    if (!market.isActive) continue;
    const providerSymbol = providerSymbolFor(market);
    if (!providerSymbol) continue;
    if (toInternal.has(providerSymbol)) throw new Error(`Provider symbol ${providerSymbol} maps to more than one market.`);
    toProvider.set(market.symbol, providerSymbol);
    toInternal.set(providerSymbol, market.symbol);
  }
  return { toProvider, toInternal };
}

const coinbaseIndex = buildIndex(coinbaseProductFor);
const twelveDataIndex = buildIndex(twelveDataSymbolFor);

export function coinbaseProductId(symbol: string): string | undefined {
  return coinbaseIndex.toProvider.get(symbol);
}

export function internalSymbolFromCoinbaseProduct(productId: string): string | undefined {
  return coinbaseIndex.toInternal.get(productId);
}

export function twelveDataSymbol(symbol: string): string | undefined {
  return twelveDataIndex.toProvider.get(symbol);
}

export function internalSymbolFromTwelveData(providerSymbol: string): string | undefined {
  return twelveDataIndex.toInternal.get(providerSymbol);
}
