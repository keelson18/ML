import type { MarketDataProvider } from '../types';
import { getMarket } from '../markets';
import { createDataProvider } from './client';
import type { DataProvider } from './types';

// Reuse one backend-backed provider instance per configured data source.
const providers: Partial<Record<MarketDataProvider, DataProvider>> = {};
const unconfiguredProvider = createDataProvider(null);

export function getDataProvider(symbol: string): DataProvider {
  const provider = getMarket(symbol)?.provider;
  if (provider !== 'binance' && provider !== 'massive' && provider !== 'twelvedata') return unconfiguredProvider;
  return providers[provider] ??= createDataProvider(provider);
}
