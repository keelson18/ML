import { fetchKlines } from '../lib/binance';
import type { Candle, Timeframe } from '../lib/types';

export const marketApi = {
  async getKlines(symbol: string, timeframe: Timeframe, limit = 1000): Promise<{ candles: Candle[] }> {
    const candles = await fetchKlines(symbol, timeframe, limit);
    return { candles };
  },
};
