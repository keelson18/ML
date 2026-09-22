import { api } from './client';
import type { Candle, Timeframe } from '../types';

export const marketApi = {
  getKlines: (symbol: string, timeframe: Timeframe, limit = 1000) =>
    api.get<{ candles: Candle[] }>(
      `/markets/klines?symbol=${symbol}&interval=${timeframe}&limit=${limit}`,
    ),
};
