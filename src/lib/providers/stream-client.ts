import type { Candle, Timeframe } from '../types';
import { authenticatedBackendRequest } from '../backend-api';

const STREAMABLE_TIMEFRAMES: ReadonlySet<Timeframe> = new Set<Timeframe>(['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d']);
const BASE_RETRY_MS = 2_000;
const MAX_RETRY_MS = 60_000;

export type StreamMode = 'stream' | 'polling';

interface StreamListener {
  timeframe: Timeframe;
  onCandle: (candle: Candle) => void;
  onMode: (mode: StreamMode) => void;
}

export function supportsStreamTimeframe(timeframe: Timeframe): boolean {
  return STREAMABLE_TIMEFRAMES.has(timeframe);
}

class StreamClient {
  private socket: WebSocket | undefined;
  private connecting = false;
  private ready = false;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Map<string, Set<StreamListener>>();

  subscribe(symbol: string, listener: StreamListener): () => void {
    let set = this.listeners.get(symbol);
    if (!set) {
      set = new Set();
      this.listeners.set(symbol, set);
    }
    set.add(listener);
    if (this.ready) this.sendSubscribe(symbol);
    else this.ensureConnected();
    return () => this.unsubscribe(symbol, listener);
  }

  private unsubscribe(symbol: string, listener: StreamListener): void {
    const set = this.listeners.get(symbol);
    if (!set || !set.delete(listener)) return;
    if (set.size > 0) return;
    this.listeners.delete(symbol);
    if (this.ready) this.send({ type: 'unsubscribe', symbols: [symbol] });
  }

  private ensureConnected(): void {
    if (this.connecting || this.socket || this.retryTimer) return;
    this.connecting = true;
    void this.connect();
  }

  private async connect(): Promise<void> {
    let ticket: string;
    try {
      ({ ticket } = await authenticatedBackendRequest<{ ticket: string }>('/api/v1/stream/ticket', { method: 'POST' }));
    } catch {
      this.scheduleRetry();
      return;
    }
    if (this.listeners.size === 0) {
      this.connecting = false;
      return;
    }
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${scheme}://${window.location.host}/api/v1/stream?ticket=${encodeURIComponent(ticket)}`);
    this.socket = socket;
    this.connecting = false;
    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onclose = () => this.handleClose(socket);
  }

  private handleClose(socket: WebSocket): void {
    if (this.socket !== socket) return;
    this.socket = undefined;
    this.ready = false;
    for (const symbol of this.listeners.keys()) this.emitMode(symbol, 'polling');
    if (this.listeners.size > 0) this.scheduleRetry();
  }

  private scheduleRetry(): void {
    this.connecting = false;
    const delay = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** this.attempt);
    this.attempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      if (this.listeners.size > 0) this.ensureConnected();
    }, delay);
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isRecord(message)) return;

    if (message.type === 'hello') {
      this.ready = true;
      this.attempt = 0;
      for (const symbol of this.listeners.keys()) this.sendSubscribe(symbol);
      return;
    }
    if (message.type === 'status' && Array.isArray(message.symbols)) {
      for (const entry of message.symbols) {
        if (isRecord(entry) && typeof entry.symbol === 'string') {
          this.emitMode(entry.symbol, entry.mode === 'stream' ? 'stream' : 'polling');
        }
      }
      return;
    }
    if (message.type === 'forming_candle') {
      this.dispatchFormingCandle(message);
    }
  }

  private dispatchFormingCandle(message: Record<string, unknown>): void {
    const { symbol, timeframe, candle } = message;
    if (typeof symbol !== 'string' || typeof timeframe !== 'string' || !isRecord(candle)) return;
    const { time, open, high, low, close } = candle;
    if (![time, open, high, low, close].every((value) => typeof value === 'number' && Number.isFinite(value))) return;
    // Coinbase ticks carry no volume, so the streamed forming bar is zero-volume and must not be drawn as volume.
    const formed: Candle = { time: time as number, open: open as number, high: high as number, low: low as number, close: close as number, volume: 0 };
    for (const listener of this.listeners.get(symbol) ?? []) {
      if (listener.timeframe === timeframe) listener.onCandle(formed);
    }
  }

  private emitMode(symbol: string, mode: StreamMode): void {
    for (const listener of this.listeners.get(symbol) ?? []) listener.onMode(mode);
  }

  private sendSubscribe(symbol: string): void {
    const timeframes = [...new Set([...(this.listeners.get(symbol) ?? [])].map((listener) => listener.timeframe))]
      .filter(supportsStreamTimeframe);
    this.send({ type: 'subscribe', symbols: [symbol], timeframes });
  }

  private send(message: object): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const streamClient = new StreamClient();

export function subscribeStreamCandles(
  symbol: string,
  timeframe: Timeframe,
  onCandle: (candle: Candle) => void,
  onMode: (mode: StreamMode) => void,
): () => void {
  return streamClient.subscribe(symbol, { timeframe, onCandle, onMode });
}
