import type { Candle, Timeframe } from '../types';
import { TIMEFRAME_MAP, type DataProvider } from './types';

// Simulated Forex data provider (OANDA-compatible interface)
// In production, replace with actual OANDA/FXCM API calls
export const forexProvider: DataProvider = {
  name: 'oanda',

  supportsMarket(marketType: string): boolean {
    return marketType === 'forex' || marketType === 'commodity' || marketType === 'index';
  },

  async fetchKlines(_symbol: string, _timeframe: Timeframe, _limit = 200): Promise<Candle[]> {
    // Placeholder: In production, call OANDA REST API
    const tf = TIMEFRAME_MAP.oanda[timeframe] ?? timeframe;
    const url = `https://api-fxpractice.oanda.com/v3/instruments/${symbol}/candles?granularity=${tf}&count=${limit}`;
    console.warn('Forex provider: using simulated data. Replace with real OANDA API.');
    return generateSimulatedCandles(200);
  },

  subscribeKlines(
    _symbol: string,
    _timeframe: Timeframe,
    _onCandle: (candle: Candle, closed: boolean) => void,
    _onStatus?: (status: 'connecting' | 'open' | 'closed' | 'reconnecting', detail?: string) => void,
  ): () => void {
    console.warn('Forex WS: not implemented. Use OANDA streaming API.');
    return () => {};
  },
};

function generateSimulatedCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  let price = 1.0800 + Math.random() * 0.02;
  const now = Math.floor(Date.now() / 1000);
  for (let i = count - 1; i >= 0; i--) {
    const change = (Math.random() - 0.5) * 0.002;
    price += change;
    const open = price;
    const close = price + (Math.random() - 0.5) * 0.001;
    const high = Math.max(open, close) + Math.random() * 0.001;
    const low = Math.min(open, close) - Math.random() * 0.001;
    candles.push({
      time: now - i * 3600,
      open,
      high,
      low,
      close,
      volume: Math.random() * 10000 + 1000,
    });
    price = close;
  }
  return candles;
}

