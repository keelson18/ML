import type { Market, MarketType } from './types';

// Single authority for what an instrument can actually do. Every consumer (provider services,
// planner, risk, autonomy, UI) must ask these helpers instead of assuming crypto-only behaviour.

export type ProviderAdapterId = 'massive' | 'twelvedata';

const PROVIDER_ADAPTERS: Readonly<Record<string, ProviderAdapterId>> = {
  massive: 'massive',
  twelvedata: 'twelvedata',
};

export function providerAdapterFor(provider: string | undefined): ProviderAdapterId | null {
  if (!provider) return null;
  return PROVIDER_ADAPTERS[provider] ?? null;
}

export function hasProviderAdapter(market: Market): boolean {
  return providerAdapterFor(market.provider) !== null;
}

// Provider-specific ticker resolution. Returns null when the registry cannot supply a real
// provider symbol; callers must treat that as "unsupported", never invent a mapping.
export function resolveSourceSymbol(market: Market): string | null {
  const adapter = providerAdapterFor(market.provider);
  if (!adapter) return null;
  if (market.sourceSymbol) return market.sourceSymbol;
  if (adapter === 'twelvedata') {
    if (market.marketType === 'crypto' && market.quoteAsset === 'USD') return `${market.baseAsset}/USD`;
    if (market.marketType === 'forex' || market.marketType === 'commodity') return `${market.baseAsset}/${market.quoteAsset}`;
    return null;
  }
  // Massive tickers: stocks use the plain symbol; crypto uses X:<SYMBOL>; indices must declare
  // an explicit I:<TICKER> source so we never guess an index mapping.
  if (market.marketType === 'crypto') return `X:${market.symbol}`;
  if (market.marketType === 'index') return null;
  return market.symbol;
}

export interface ProviderSupport {
  supported: boolean;
  provider: ProviderAdapterId | null;
  sourceSymbol: string | null;
  reason: string;
}

export function providerSupport(market: Market): ProviderSupport {
  if (!market.isActive) {
    return { supported: false, provider: providerAdapterFor(market.provider), sourceSymbol: null, reason: 'Instrument is not active in the registry.' };
  }
  const adapter = providerAdapterFor(market.provider);
  if (!adapter) {
    return { supported: false, provider: null, sourceSymbol: null, reason: `No market-data adapter is configured for provider "${market.provider}".` };
  }
  const sourceSymbol = resolveSourceSymbol(market);
  if (!sourceSymbol) {
    return { supported: false, provider: adapter, sourceSymbol: null, reason: `No ${adapter} source mapping is configured for ${market.symbol}.` };
  }
  return { supported: true, provider: adapter, sourceSymbol, reason: `Mapped to ${adapter} as ${sourceSymbol}.` };
}

export function isProviderSupportedMarket(market: Market): boolean {
  return providerSupport(market).supported;
}

export type SessionModel = 'continuous' | 'exchange-calendar';

export function marketSessionModel(market: Market): SessionModel {
  return market.marketType === 'crypto' ? 'continuous' : 'exchange-calendar';
}

export function settlementCurrency(market: Market): string {
  return market.priceCurrency ?? market.quoteAsset;
}

export function pricePrecision(market: Market): number {
  if (typeof market.pricePrecision === 'number') return market.pricePrecision;
  if (market.marketType === 'forex') return market.quoteAsset === 'JPY' ? 3 : 5;
  if (market.marketType === 'crypto') return 2;
  return 2;
}

export function tickSize(market: Market): number {
  if (typeof market.tickSize === 'number' && market.tickSize > 0) return market.tickSize;
  return Number(`1e-${pricePrecision(market)}`);
}

export function contractSize(market: Market): number {
  return typeof market.contractSize === 'number' && market.contractSize > 0 ? market.contractSize : 1;
}

export function supportsPlanSide(market: Market, side: 'long' | 'short'): boolean {
  return side === 'long' ? true : market.shortable === true;
}

// Paper accounts are USD-denominated spot accounts. An instrument is paper-eligible when its
// realised P&L settles in USD and a real provider adapter can supply validated candles.
export function paperSettlementEligible(market: Market): boolean {
  return isProviderSupportedMarket(market) && settlementCurrency(market) === 'USD';
}

export function paperEligibilityReason(market: Market): string {
  const support = providerSupport(market);
  if (!support.supported) return support.reason;
  if (settlementCurrency(market) !== 'USD') {
    return `Paper accounts settle in USD; ${market.symbol} settles in ${settlementCurrency(market)} and needs FX conversion before it can be paper traded.`;
  }
  return 'Eligible for paper trading when provider availability is verified.';
}

export function supportsTimeframe(market: Market, timeframe: string): boolean {
  const adapter = providerAdapterFor(market.provider);
  if (!adapter) return false;
  // Twelve Data has no native 3m interval; the shared service aggregates it from 1m bars.
  if (timeframe === '3m') return true;
  if (market.supportedTimeframes) return market.supportedTimeframes.includes(timeframe);
  return true;
}

export function defaultSessionTimezone(market: Market): string {
  if (market.sessionTimezone) return market.sessionTimezone;
  if (market.marketType === 'forex') return 'UTC';
  if (market.marketType === 'stock') return 'America/New_York';
  if (market.marketType === 'index') return market.exchange === 'Massive' ? 'America/New_York' : 'UTC';
  if (market.marketType === 'commodity') return 'UTC';
  return 'UTC';
}

export function marketTypeLabel(marketType: MarketType): string {
  return marketType === 'crypto' ? 'Cryptocurrency'
    : marketType === 'commodity' ? 'Commodity'
      : marketType === 'forex' ? 'Forex'
        : marketType === 'index' ? 'Index'
          : 'Stock';
}

export function marketCurrencySuffix(market: Market): string {
  return settlementCurrency(market);
}
