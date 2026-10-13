import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { z } from 'zod';
import { getMarket } from '../../../src/lib/markets';
import { TIMEFRAMES, type Timeframe } from '../../../src/lib/types';
import { CandleAggregator, isAggregatableTimeframe, isCurrentBucket } from './candle-aggregator';
import type { FeedRouter } from './feed-router';
import type { TicketStore } from './stream-tickets';
import type { LiveFeed, Tick } from './types';

export const STREAM_PATH = '/api/v1/stream';

const AGGREGATABLE_TIMEFRAMES = TIMEFRAMES.map((timeframe) => timeframe.value).filter(isAggregatableTimeframe);
const STATUS_TEXT: Record<number, string> = { 401: 'Unauthorized', 403: 'Forbidden', 429: 'Too Many Requests', 503: 'Service Unavailable' };

const symbolSchema = z.string().min(1).max(20);
const streamTimeframeSchema = z.string().refine((value) => AGGREGATABLE_TIMEFRAMES.some((timeframe) => timeframe === value));
const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe'), symbols: z.array(symbolSchema).min(1).max(50), timeframes: z.array(streamTimeframeSchema).max(AGGREGATABLE_TIMEFRAMES.length).default([]) }),
  z.object({ type: z.literal('unsubscribe'), symbols: z.array(symbolSchema).min(1).max(50) }),
  z.object({ type: z.literal('resync'), symbol: symbolSchema }),
]);

export interface StreamGatewayOptions {
  feeds: readonly LiveFeed[];
  router: FeedRouter;
  tickets: TicketStore;
  allowedOrigins: readonly string[];
  maxClients: number;
  maxConnectionsPerUser: number;
  maxSubscriptions: number;
  maxMessageBytes: number;
  maxBufferedBytes: number;
  maxConnectionMs: number;
}

interface Client {
  socket: WebSocket;
  userId: string;
  subscriptions: Map<string, { timeframes: Set<Timeframe> }>;
}

type Admission = { userId: string } | { status: number };

export class StreamGateway {
  private readonly wss: WebSocketServer;
  private readonly clients = new Set<Client>();
  private readonly refCounts = new Map<string, number>();
  private readonly sequences = new Map<string, number>();
  private readonly lastTicks = new Map<string, { sequence: number; price: number; timestamp: number }>();
  private readonly aggregator = new CandleAggregator(AGGREGATABLE_TIMEFRAMES);
  private droppedUpdates = 0;

  constructor(private readonly options: StreamGatewayOptions) {
    this.wss = new WebSocketServer({ noServer: true, maxPayload: options.maxMessageBytes });
    for (const feed of options.feeds) {
      feed.onTick((tick) => this.handleTick(tick));
      feed.onStatus(() => this.broadcastStatus());
    }
  }

  attach(server: Server): void {
    server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname !== STREAM_PATH) {
        socket.destroy();
        return;
      }
      const admission = this.admit(request, url);
      if ('status' in admission) {
        socket.write(`HTTP/1.1 ${admission.status} ${STATUS_TEXT[admission.status] ?? 'Error'}\r\nConnection: close\r\n\r\n`);
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(request, socket, head, (ws) => this.accept(ws, admission.userId));
    });
  }

  diagnostics() {
    return { clients: this.clients.size, symbols: this.refCounts.size, droppedUpdates: this.droppedUpdates };
  }

  feedDiagnostics() {
    return this.options.feeds.map((feed) => {
      const symbols = [...this.refCounts.keys()].filter((symbol) => feed.supports(symbol));
      const tickTimes = symbols.map((symbol) => this.lastTicks.get(symbol)?.timestamp).filter((value): value is number => value !== undefined);
      const stats = feed.diagnostics?.();
      return {
        feed: feed.id,
        status: feed.status(),
        subscribedSymbols: stats?.subscribedSymbols ?? symbols.length,
        connectedClients: [...this.clients].filter((client) => [...client.subscriptions.keys()].some((symbol) => symbols.includes(symbol))).length,
        droppedUpdates: this.droppedUpdates,
        reconnects: stats?.reconnects ?? 0,
        gaps: stats?.gaps ?? 0,
        lastTickAt: tickTimes.length ? Math.max(...tickTimes) : stats?.lastTickAt ?? null,
      };
    });
  }

  async close(): Promise<void> {
    for (const client of this.clients) client.socket.close(1001);
    this.clients.clear();
    this.refCounts.clear();
    this.wss.close();
    await Promise.all(this.options.feeds.map((feed) => feed.close()));
  }

  private admit(request: IncomingMessage, url: URL): Admission {
    const origin = request.headers.origin;
    if (!origin || !this.options.allowedOrigins.includes(origin)) return { status: 403 };
    const ticket = url.searchParams.get('ticket');
    const userId = ticket ? this.options.tickets.redeem(ticket) : undefined;
    if (!userId) return { status: 401 };
    if (this.clients.size >= this.options.maxClients) return { status: 503 };
    if (this.connectionsFor(userId) >= this.options.maxConnectionsPerUser) return { status: 429 };
    return { userId };
  }

  private connectionsFor(userId: string): number {
    let count = 0;
    for (const client of this.clients) if (client.userId === userId) count += 1;
    return count;
  }

  private accept(socket: WebSocket, userId: string): void {
    const client: Client = { socket, userId, subscriptions: new Map() };
    this.clients.add(client);
    socket.on('message', (data: RawData) => this.handleClientMessage(client, data));
    const lifetime = setTimeout(() => socket.close(4001, 'connection_lifetime'), this.options.maxConnectionMs);
    socket.on('close', () => {
      clearTimeout(lifetime);
      this.removeClient(client);
    });
    socket.on('error', () => socket.close());
    this.sendJson(client, { type: 'hello', serverTime: new Date().toISOString(), maxSubscriptions: this.options.maxSubscriptions, maxMessageBytes: this.options.maxMessageBytes });
  }

  private removeClient(client: Client): void {
    if (!this.clients.delete(client)) return;
    for (const symbol of client.subscriptions.keys()) this.release(symbol);
    client.subscriptions.clear();
  }

  private handleClientMessage(client: Client, data: RawData): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      this.sendError(client, 'invalid_message');
      return;
    }
    const message = clientMessageSchema.safeParse(parsed);
    if (!message.success) {
      this.sendError(client, 'invalid_message');
      return;
    }
    switch (message.data.type) {
      case 'subscribe':
        this.subscribe(client, message.data.symbols, message.data.timeframes as Timeframe[]);
        return;
      case 'unsubscribe':
        this.unsubscribe(client, message.data.symbols);
        return;
      case 'resync':
        this.resync(client, message.data.symbol);
        return;
    }
  }

  private subscribe(client: Client, symbols: string[], timeframes: Timeframe[]): void {
    const requested = [...new Set(symbols)];
    const unknown = requested.filter((symbol) => !this.isStreamable(symbol));
    if (unknown.length > 0) this.sendError(client, 'unknown_symbol', unknown);
    const accepted = requested.filter((symbol) => this.isStreamable(symbol));
    const added = accepted.filter((symbol) => !client.subscriptions.has(symbol)).length;
    if (client.subscriptions.size + added > this.options.maxSubscriptions) {
      this.sendError(client, 'subscription_limit');
      return;
    }
    for (const symbol of accepted) {
      let subscription = client.subscriptions.get(symbol);
      if (!subscription) {
        if (!this.retain(symbol)) {
          this.sendError(client, 'feed_limit', [symbol]);
          continue;
        }
        subscription = { timeframes: new Set() };
        client.subscriptions.set(symbol, subscription);
      }
      for (const timeframe of timeframes) subscription.timeframes.add(timeframe);
    }
    this.sendJson(client, { type: 'status', symbols: accepted.map((symbol) => this.statusFor(symbol)) });
  }

  private unsubscribe(client: Client, symbols: string[]): void {
    for (const symbol of new Set(symbols)) {
      if (client.subscriptions.delete(symbol)) this.release(symbol);
    }
  }

  private resync(client: Client, symbol: string): void {
    const subscription = client.subscriptions.get(symbol);
    if (!subscription) {
      this.sendError(client, 'not_subscribed', [symbol]);
      return;
    }
    const last = this.lastTicks.get(symbol);
    const now = Date.now();
    const forming = [...subscription.timeframes].flatMap((timeframe) => {
      const candle = this.aggregator.formingCandle(symbol, timeframe);
      return candle && isCurrentBucket(candle, timeframe, now) ? [candle] : [];
    });
    this.sendJson(client, {
      type: 'snapshot',
      symbol,
      sequence: last?.sequence ?? 0,
      price: last?.price ?? null,
      timestamp: last?.timestamp ?? null,
      forming,
    });
  }

  private handleTick(tick: Tick): void {
    const sequence = (this.sequences.get(tick.symbol) ?? 0) + 1;
    this.sequences.set(tick.symbol, sequence);
    this.lastTicks.set(tick.symbol, { sequence, price: tick.price, timestamp: tick.timestamp });
    this.aggregator.applyTick(tick);
    for (const client of this.clients) {
      const subscription = client.subscriptions.get(tick.symbol);
      if (!subscription) continue;
      this.sendJson(client, { type: 'tick', symbol: tick.symbol, sequence, price: tick.price, timestamp: tick.timestamp }, true);
      for (const timeframe of subscription.timeframes) {
        const candle = this.aggregator.formingCandle(tick.symbol, timeframe);
        if (candle) this.sendJson(client, { type: 'forming_candle', symbol: tick.symbol, timeframe, sequence, candle }, true);
      }
    }
  }

  private broadcastStatus(): void {
    for (const client of this.clients) {
      if (client.subscriptions.size === 0) continue;
      this.sendJson(client, { type: 'status', symbols: [...client.subscriptions.keys()].map((symbol) => this.statusFor(symbol)) });
    }
  }

  private statusFor(symbol: string) {
    const lastTickAt = this.lastTicks.get(symbol)?.timestamp ?? null;
    const route = this.options.router.route(symbol);
    if (route.kind === 'stream') return { symbol, mode: 'stream' as const, feed: route.feedId, lastTickAt };
    if (route.reason === 'unsupported') return { symbol, mode: 'polling' as const, reason: 'unsupported', lastTickAt };
    return { symbol, mode: 'polling' as const, reason: 'feed-unavailable', feed: route.feedId, feedStatus: route.feedStatus, lastTickAt };
  }

  private isStreamable(symbol: string): boolean {
    return getMarket(symbol)?.isActive === true && this.feedFor(symbol) !== undefined;
  }

  private feedFor(symbol: string): LiveFeed | undefined {
    return this.options.feeds.find((feed) => feed.supports(symbol));
  }

  private retain(symbol: string): boolean {
    const count = (this.refCounts.get(symbol) ?? 0) + 1;
    if (count === 1) {
      try {
        this.feedFor(symbol)?.subscribe([symbol]);
      } catch {
        return false;
      }
    }
    this.refCounts.set(symbol, count);
    return true;
  }

  private release(symbol: string): void {
    const count = (this.refCounts.get(symbol) ?? 1) - 1;
    if (count > 0) {
      this.refCounts.set(symbol, count);
      return;
    }
    this.refCounts.delete(symbol);
    this.aggregator.forget(symbol);
    this.feedFor(symbol)?.unsubscribe([symbol]);
  }

  private sendError(client: Client, code: string, symbols?: string[]): void {
    this.sendJson(client, { type: 'error', code, symbols });
  }

  private sendJson(client: Client, message: object, droppable = false): boolean {
    if (client.socket.readyState !== WebSocket.OPEN) return false;
    if (droppable && client.socket.bufferedAmount > this.options.maxBufferedBytes) {
      this.droppedUpdates += 1;
      return false;
    }
    client.socket.send(JSON.stringify(message));
    return true;
  }
}
