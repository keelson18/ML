import type { Candle, Timeframe } from '../types';
import type { DataProvider } from './types';
import { fetchWithTimeout } from './request';
import { TIMEFRAME_MAP } from './types';

const REST = 'https://api.twelvedata.com';
const WS = 'wss://ws.twelvedata.com/v1/quotes/price';
const API_KEY = import.meta.env.VITE_TWELVEDATA_API_KEY as string | undefined;

type TwelveDataCandle = {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
};

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
  '1w': 604800,
  '1M': 2592000,
};

export const forexProvider: DataProvider = {
  name: 'twelvedata',

  supportsMarket(marketType: string): boolean {
    return marketType === 'forex' || marketType === 'commodity';
  },

  async fetchKlines(symbol: string, timeframe: Timeframe, limit = 200): Promise<Candle[]> {
    if (!API_KEY) throw new Error('VITE_TWELVEDATA_API_KEY is not configured.');
    const tf = TIMEFRAME_MAP.twelvedata[timeframe] ?? timeframe;
    const formattedSymbol = formatSymbol(symbol);
    const url = `${REST}/time_series?symbol=${encodeURIComponent(formattedSymbol)}&interval=${tf}&outputsize=${limit}&apikey=${encodeURIComponent(API_KEY)}`;

    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`Twelve Data error ${res.status}`);
    const data = await res.json() as { status?: string; message?: string; values?: TwelveDataCandle[] };
    if (data.status === 'error') throw new Error(data.message ?? 'Twelve Data request failed.');
    if (!data.values) throw new Error('Twelve Data returned no candles.');

    return data.values.map((k) => ({
      time: Math.floor(new Date(k.datetime).getTime() / 1000),
      open: Number(k.open),
      high: Number(k.high),
      low: Number(k.low),
      close: Number(k.close),
      volume: Number(k.volume ?? 0),
    })).filter((candle) => Number.isFinite(candle.time) && Number.isFinite(candle.close)).reverse();
  },

  subscribeKlines(
    symbol: string,
    timeframe: Timeframe,
    onCandle: (candle: Candle, closed: boolean) => void,
    onStatus?: (status: 'connecting' | 'open' | 'closed' | 'reconnecting', detail?: string) => void,
  ): () => void {
    let ws: WebSocket | null = null;
    let closed = false;
    let current: Candle | null = null;
    const bucketSeconds = TIMEFRAME_SECONDS[timeframe];
    const formattedSymbol = formatSymbol(symbol);

    if (!API_KEY) {
      onStatus?.('closed', 'Twelve Data API key is not configured.');
      return () => { closed = true; };
    }

    const connect = () => {
      if (closed) return;
      onStatus?.('connecting');
      ws = new WebSocket(`${WS}?apikey=${encodeURIComponent(API_KEY)}`);

      ws.onopen = () => {
        onStatus?.('open');
        ws?.send(JSON.stringify({ action: 'subscribe', params: { symbols: formattedSymbol } }));
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as { event?: string; timestamp?: number | string; price?: number | string };
          if (msg.event !== 'price' || msg.timestamp === undefined || msg.price === undefined) return;
          const rawTimestamp = Number(msg.timestamp);
          const price = Number(msg.price);
          if (!Number.isFinite(rawTimestamp) || !Number.isFinite(price)) return;
          const now = rawTimestamp > 1_000_000_000_000 ? Math.floor(rawTimestamp / 1000) : Math.floor(rawTimestamp);
          const bucket = Math.floor(now / bucketSeconds) * bucketSeconds;

          if (current && current.time !== bucket) {
            onCandle(current, true);
            current = null;
          }
          if (!current) {
            current = { time: bucket, open: price, high: price, low: price, close: price, volume: 0 };
          } else {
            current.high = Math.max(current.high, price);
            current.low = Math.min(current.low, price);
            current.close = price;
          }
          onCandle({ ...current }, false);
        } catch {
          // Ignore malformed provider messages.
        }
      };

      ws.onclose = () => {
        if (!closed) onStatus?.('closed');
      };
      ws.onerror = () => {
        try { ws?.close(); } catch { /* noop */ }
      };
    };

    connect();

    return () => {
      closed = true;
      try { ws?.close(); } catch { /* noop */ }
    };
  },
};

function formatSymbol(symbol: string): string {
  if (symbol.includes('/')) return symbol;
  const knownSymbols: Record<string, string> = {
    USOIL: 'WTI/USD',
    UKOIL: 'BRENT/USD',
    NATGAS: 'NATGAS/USD',
  };
  return knownSymbols[symbol] ?? `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
}
