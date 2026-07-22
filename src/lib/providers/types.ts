import type { Candle, Timeframe } from '../types';

// Unified data provider interface
export interface DataProvider {
  name: string;
  supportsMarket(marketType: string): boolean;
  fetchKlines(symbol: string, timeframe: Timeframe, limit?: number): Promise<Candle[]>;
  subscribeKlines(
    symbol: string,
    timeframe: Timeframe,
    onCandle: (candle: Candle, closed: boolean) => void,
    onStatus?: (status: 'connecting' | 'open' | 'closed' | 'reconnecting', detail?: string) => void,
  ): () => void;
}

// Timeframe mapping helper for providers
export const TIMEFRAME_MAP: Record<string, Record<string, string>> = {
  binance: {
    '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
    '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w', '1M': '1M',
  },
  oanda: {
    '1m': 'M1', '3m': 'M3', '5m': 'M5', '15m': 'M15', '30m': 'M30',
    '1h': 'H1', '4h': 'H4', '1d': 'D', '1w': 'W', '1M': 'M',
  },
  polygon: {
    '1m': '1', '5m': '5', '15m': '15', '30m': '30',
    '1h': '60', '4h': '240', '1d': 'day', '1w': 'week', '1M': 'month',
  },
};

