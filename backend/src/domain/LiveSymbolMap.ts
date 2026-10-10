import { MARKET_UNIVERSE } from '../../../src/lib/markets';
import type { Market } from '../../../src/lib/types';

// Lives outside src/live so config validation can use it without pulling streaming code into trader/engines.

function coinbaseProductFor(market: Market): string | undefined {
  if (market.marketType !== 'crypto' || market.provider !== 'massive' || market.quoteAsset !== 'USD') return undefined;
  return `${market.baseAsset}-USD`;
}

function twelveDataSymbolFor(market: Market): string | undefined {
  if (market.marketType === 'stock') return market.baseAsset;
  if (market.provider === 'twelvedata' && (market.marketType === 'forex' || market.marketType === 'commodity')) {
    return market.sourceSymbol ?? `${market.baseAsset}/${market.quoteAsset}`;
  }
  return undefined;
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
