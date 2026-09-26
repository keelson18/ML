import type { MarketType } from '../types';
import type { DataProvider } from './types';
import { binanceProvider } from './binance';
import { forexProvider } from './forex';
import { stocksProvider } from './stocks';

export function getDataProvider(marketType: MarketType): DataProvider {
  switch (marketType) {
    case 'crypto':
      return binanceProvider;
    case 'forex':
    case 'commodity':
      return forexProvider;
    case 'index':
    case 'stock':
      return stocksProvider;
  }
}
