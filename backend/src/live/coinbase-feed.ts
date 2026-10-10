import { z } from 'zod';
import { coinbaseProductId, internalSymbolFromCoinbaseProduct } from '../domain/LiveSymbolMap';
import { createNodeSocket, type LiveSocket, type SocketFactory } from './socket';
import type { FeedStatus, LiveFeed, Tick } from './types';

export const COINBASE_WS_URL = 'wss://advanced-trade-ws.coinbase.com';

const envelopeSchema = z.object({
  channel: z.string(),
  timestamp: z.string(),
  sequence_num: z.number().int().nonnegative(),
  events: z.array(z.unknown()).optional(),
});
const tickerEventSchema = z.object({
  tickers: z.array(z.object({
    product_id: z.string().min(1),
    price: z.coerce.number().finite().positive(),
  })).optional(),
});

export interface CoinbaseFeedOptions {
  maxSymbols: number;
  staleMs: number;
  createSocket?: SocketFactory;
  now?: () => number;
  random?: () => number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

export interface CoinbaseFeedStats {
  ticks: number;
  duplicates: number;
  malformed: number;
  reconnects: number;
}

type Timer = ReturnType<typeof setTimeout>;
type TickListener = (tick: Tick) => void;
type StatusListener = (status: FeedStatus) => void;

export function backoffDelayMs(attempt: number, baseMs: number, maxMs: number, random: () => number): number {
  const capped = Math.min(maxMs, baseMs * 2 ** attempt);
  return capped / 2 + random() * (capped / 2);
}

export class CoinbaseFeed implements LiveFeed {
  readonly id = 'coinbase' as const;

  private readonly desired = new Set<string>();
  private readonly tickListeners = new Set<TickListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private readonly lastSequence = new Map<string, number>();
  private readonly stats: CoinbaseFeedStats = { ticks: 0, duplicates: 0, malformed: 0, reconnects: 0 };
  private readonly createSocket: SocketFactory;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private state: FeedStatus = 'down';
  private socket: LiveSocket | undefined;
  private reconnectTimer: Timer | undefined;
  private staleTimer: ReturnType<typeof setInterval> | undefined;
  private lastMessageAt = 0;
  private attempt = 0;
  private closed = false;

  constructor(private readonly options: CoinbaseFeedOptions) {
    this.createSocket = options.createSocket ?? createNodeSocket;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.baseBackoffMs = options.baseBackoffMs ?? 1_000;
    this.maxBackoffMs = options.maxBackoffMs ?? 30_000;
  }

  supports(symbol: string): boolean {
    return coinbaseProductId(symbol) !== undefined;
  }

  limits() {
    return { maxSymbols: this.options.maxSymbols };
  }

  status(): FeedStatus {
    return this.state;
  }

  diagnostics(): Readonly<CoinbaseFeedStats> {
    return { ...this.stats };
  }

  subscribe(symbols: readonly string[]): void {
    if (this.closed) return;
    const additions = [...new Set(symbols)].filter((symbol) => this.supports(symbol) && !this.desired.has(symbol));
    if (this.desired.size + additions.length > this.options.maxSymbols) {
      throw new Error(`Coinbase subscriptions are limited to ${this.options.maxSymbols} symbols.`);
    }
    for (const symbol of additions) this.desired.add(symbol);
    if (additions.length > 0 && this.state === 'connected') this.sendTickerSubscription('subscribe', additions);
    if (this.desired.size > 0 && !this.socket && !this.reconnectTimer) this.connect();
  }

  unsubscribe(symbols: readonly string[]): void {
    const removed = [...new Set(symbols)].filter((symbol) => this.desired.delete(symbol));
    if (removed.length > 0 && this.state === 'connected' && this.desired.size > 0) {
      this.sendTickerSubscription('unsubscribe', removed);
    }
    if (this.desired.size === 0) this.teardown();
  }

  onTick(listener: TickListener): () => void {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.desired.clear();
    this.teardown();
  }

  private connect(): void {
    const socket = this.createSocket(COINBASE_WS_URL);
    this.socket = socket;
    socket.on('open', () => {
      if (this.socket !== socket) return;
      this.attempt = 0;
      this.lastSequence.clear();
      this.lastMessageAt = this.now();
      this.setStatus('connected');
      this.sendTickerSubscription('subscribe', [...this.desired]);
      socket.send(JSON.stringify({ type: 'subscribe', channel: 'heartbeats' }));
      this.startStaleWatch();
    });
    socket.on('message', (data) => {
      if (this.socket !== socket) return;
      this.handleMessage(data);
    });
    socket.on('close', () => this.handleDisconnect(socket));
    socket.on('error', () => {
      this.handleDisconnect(socket);
      socket.close();
    });
  }

  private handleMessage(data: unknown): void {
    this.lastMessageAt = this.now();
    const envelope = parseEnvelope(data);
    if (!envelope) {
      this.stats.malformed += 1;
      return;
    }
    const previous = this.lastSequence.get(envelope.channel);
    if (previous !== undefined && envelope.sequence_num <= previous) {
      this.stats.duplicates += 1;
      return;
    }
    this.lastSequence.set(envelope.channel, envelope.sequence_num);
    if (envelope.channel !== 'ticker') return;

    const timestamp = Date.parse(envelope.timestamp);
    if (!Number.isFinite(timestamp)) {
      this.stats.malformed += 1;
      return;
    }
    for (const rawEvent of envelope.events ?? []) {
      const event = tickerEventSchema.safeParse(rawEvent);
      if (!event.success) {
        this.stats.malformed += 1;
        continue;
      }
      for (const ticker of event.data.tickers ?? []) {
        const symbol = internalSymbolFromCoinbaseProduct(ticker.product_id);
        if (!symbol || !this.desired.has(symbol)) continue;
        this.stats.ticks += 1;
        const tick: Tick = { symbol, price: ticker.price, volume: null, timestamp };
        for (const listener of this.tickListeners) listener(tick);
      }
    }
  }

  private handleDisconnect(socket: LiveSocket): void {
    if (this.socket !== socket) return;
    this.socket = undefined;
    this.clearStaleWatch();
    if (this.closed || this.desired.size === 0) {
      this.setStatus('down');
      return;
    }
    this.setStatus('reconnecting');
    this.stats.reconnects += 1;
    const delay = backoffDelayMs(this.attempt, this.baseBackoffMs, this.maxBackoffMs, this.random);
    this.attempt += 1;
    console.warn(`[live] coinbase feed reconnecting in ${Math.round(delay)}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (!this.closed && this.desired.size > 0) this.connect();
    }, delay);
  }

  private startStaleWatch(): void {
    this.clearStaleWatch();
    const interval = Math.max(100, Math.floor(this.options.staleMs / 2));
    this.staleTimer = setInterval(() => {
      const socket = this.socket;
      if (!socket || this.now() - this.lastMessageAt <= this.options.staleMs) return;
      console.warn('[live] coinbase feed stale; reconnecting');
      socket.close();
      this.handleDisconnect(socket);
    }, interval);
  }

  private clearStaleWatch(): void {
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.staleTimer = undefined;
  }

  private teardown(): void {
    this.clearStaleWatch();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
    this.attempt = 0;
    this.setStatus('down');
  }

  private sendTickerSubscription(type: 'subscribe' | 'unsubscribe', symbols: readonly string[]): void {
    const productIds = symbols.map((symbol) => coinbaseProductId(symbol)).filter((id): id is string => id !== undefined);
    if (productIds.length === 0) return;
    this.socket?.send(JSON.stringify({ type, channel: 'ticker', product_ids: productIds }));
  }

  private setStatus(next: FeedStatus): void {
    if (this.state === next) return;
    this.state = next;
    for (const listener of this.statusListeners) listener(next);
  }
}

function parseEnvelope(data: unknown) {
  if (typeof data !== 'string') return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return undefined;
  }
  const result = envelopeSchema.safeParse(parsed);
  return result.success ? result.data : undefined;
}
