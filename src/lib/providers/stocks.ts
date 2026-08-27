import type { Candle, Timeframe } from '../types';
import { TIMEFRAME_MAP, type DataProvider } from './types';

// Simulated Stocks/Indices data provider (Polygon.io-compatible interface)
// In production, replace with actual Polygon/IEX/Yahoo Finance API calls
export const stocksProvider: DataProvider = {
  name: 'polygon',

  supportsMarket(marketType: string): boolean {
    return marketType === 'stock' || marketType === 'index';
  },

  async fetchKlines(_symbol: string, _timeframe: Timeframe, _limit = 200): Promise<Candle[]> {
    // Placeholder: In production, call Polygon REST API
    //const tf = TIMEFRAME_MAP.polygon[timeframe] ?? timeframe;
    //const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${KEY}`;
    console.warn('Stocks provider: using simulated data. Replace with real Polygon.io API.');
    return generateSimulatedCandles(200);
  },

  subscribeKlines(
    _symbol: string,
    _timeframe: Timeframe,
    _onCandle: (candle: Candle, closed: boolean) => void,
    _onStatus?: (status: 'connecting' | 'open' | 'closed' | 'reconnecting', detail?: string) => void,
  ): () => void {
    console.warn('Stocks WS: not implemented. Use Polygon websocket API.');
    return () => {};
  },
};

function generateSimulatedCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  let price = 150 + Math.random() * 100;
  const now = Math.floor(Date.now() / 1000);
  for (let i = count - 1; i >= 0; i--) {
    const change = (Math.random() - 0.5) * 2;
    price += change;
    const open = price;
    const close = price + (Math.random() - 0.5) * 1.5;
    const high = Math.max(open, close) + Math.random() * 1;
    const low = Math.min(open, close) - Math.random() * 1;
    candles.push({
      time: now - i * 86400,
      open,
      high,
      low,
      close,
      volume: Math.random() * 10000000 + 1000000,
    });
    price = close;
  }
  return candles;
}

