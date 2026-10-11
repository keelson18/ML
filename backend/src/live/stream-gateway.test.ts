import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createFeedRouter } from './feed-router';
import { STREAM_PATH, StreamGateway } from './stream-gateway';
import { TicketStore } from './stream-tickets';
import type { FeedId, FeedStatus, LiveFeed, Tick } from './types';

type Message = Record<string, unknown>;

const ORIGIN = 'http://localhost:5173';
const SUPPORTED = ['BTCUSD', 'ETHUSD', 'SOLUSD'];

class FakeFeed implements LiveFeed {
  readonly id: FeedId = 'coinbase';
  readonly subscribed: string[] = [];
  readonly unsubscribed: string[] = [];
  private current: FeedStatus = 'connected';
  private readonly tickListeners = new Set<(tick: Tick) => void>();

  supports(symbol: string): boolean {
    return SUPPORTED.includes(symbol);
  }
  subscribe(symbols: readonly string[]): void {
    this.subscribed.push(...symbols);
  }
  unsubscribe(symbols: readonly string[]): void {
    this.unsubscribed.push(...symbols);
  }
  onTick(listener: (tick: Tick) => void): () => void {
    this.tickListeners.add(listener);
    return () => this.tickListeners.delete(listener);
  }
  onStatus(): () => void {
    return () => undefined;
  }
  status(): FeedStatus {
    return this.current;
  }
  limits() {
    return { maxSymbols: 20 };
  }
  async close(): Promise<void> {
    this.current = 'down';
  }
  emit(tick: Tick): void {
    for (const listener of this.tickListeners) listener(tick);
  }
}

interface Session {
  socket: WebSocket;
  inbox: Message[];
}

async function eventually<T>(read: () => T | undefined, timeoutMs = 2_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = read();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('condition not met before timeout');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('stream gateway', () => {
  let server: Server;
  let gateway: StreamGateway;
  let feed: FakeFeed;
  let tickets: TicketStore;
  let url: string;

  beforeEach(async () => {
    feed = new FakeFeed();
    tickets = new TicketStore(30_000);
    gateway = new StreamGateway({
      feeds: [feed],
      router: createFeedRouter([feed]),
      tickets,
      allowedOrigins: [ORIGIN],
      maxClients: 5,
      maxConnectionsPerUser: 1,
      maxSubscriptions: 2,
      maxMessageBytes: 4_096,
      maxBufferedBytes: 262_144,
    });
    server = createServer();
    gateway.attach(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}${STREAM_PATH}`;
  });

  afterEach(async () => {
    await gateway.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function connect(ticket: string, origin = ORIGIN): Promise<Session> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`${url}?ticket=${encodeURIComponent(ticket)}`, { headers: { Origin: origin } });
      const inbox: Message[] = [];
      socket.on('message', (data) => inbox.push(JSON.parse(data.toString()) as Message));
      socket.once('open', () => resolve({ socket, inbox }));
      socket.once('error', reject);
    });
  }

  function send(session: Session, message: unknown): void {
    session.socket.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  function messageOfType(session: Session, type: string, predicate: (message: Message) => boolean = () => true) {
    return eventually(() => session.inbox.find((message) => message.type === type && predicate(message)));
  }

  function issue(userId: string): string {
    return tickets.issue(userId).ticket;
  }

  it('redeems a ticket once and rejects reuse', async () => {
    const ticket = issue('user-a');
    const session = await connect(ticket);
    await messageOfType(session, 'hello');
    session.socket.close();
    await expect(connect(ticket)).rejects.toThrow('401');
  });

  it('rejects an unknown ticket and a disallowed origin', async () => {
    await expect(connect('not-issued')).rejects.toThrow('401');
    await expect(connect(issue('user-b'), 'https://evil.example')).rejects.toThrow('403');
  });

  it('caps connections per user', async () => {
    const first = await connect(issue('user-c'));
    await messageOfType(first, 'hello');
    await expect(connect(issue('user-c'))).rejects.toThrow('429');
    first.socket.close();
  });

  it('streams ticks and forming candles without volume to subscribed clients', async () => {
    const session = await connect(issue('user-d'));
    send(session, { type: 'subscribe', symbols: ['BTCUSD'], timeframes: ['1m'] });
    await messageOfType(session, 'status', (message) => JSON.stringify(message).includes('BTCUSD'));
    expect(feed.subscribed).toEqual(['BTCUSD']);

    feed.emit({ symbol: 'BTCUSD', price: 100, volume: null, timestamp: 60_000 });
    const tick = await messageOfType(session, 'tick');
    expect(tick).toMatchObject({ symbol: 'BTCUSD', sequence: 1, price: 100 });
    const forming = await messageOfType(session, 'forming_candle');
    expect(forming).toMatchObject({ symbol: 'BTCUSD', timeframe: '1m', sequence: 1, candle: { time: 60, open: 100, volume: null, forming: true } });
    session.socket.close();
  });

  it('subscribes the upstream feed once for several clients and releases it after the last leaves', async () => {
    const first = await connect(issue('user-e'));
    const second = await connect(issue('user-f'));
    send(first, { type: 'subscribe', symbols: ['BTCUSD'] });
    send(second, { type: 'subscribe', symbols: ['BTCUSD'] });
    await messageOfType(second, 'status');
    expect(feed.subscribed).toEqual(['BTCUSD']);

    first.socket.close();
    second.socket.close();
    await eventually(() => (feed.unsubscribed.includes('BTCUSD') ? true : undefined));
  });

  it('rejects unknown symbols and enforces the per-connection subscription cap', async () => {
    const session = await connect(issue('user-g'));
    send(session, { type: 'subscribe', symbols: ['NOPE'] });
    await messageOfType(session, 'error', (message) => message.code === 'unknown_symbol');

    send(session, { type: 'subscribe', symbols: ['BTCUSD', 'ETHUSD', 'SOLUSD'] });
    await messageOfType(session, 'error', (message) => message.code === 'subscription_limit');
    expect(feed.subscribed).toEqual([]);
    session.socket.close();
  });

  it('answers resync with the last known price for a subscribed symbol', async () => {
    const session = await connect(issue('user-h'));
    send(session, { type: 'subscribe', symbols: ['ETHUSD'], timeframes: ['1h'] });
    await messageOfType(session, 'status');
    feed.emit({ symbol: 'ETHUSD', price: 3_000, volume: null, timestamp: 3_600_000 });
    await messageOfType(session, 'tick');

    send(session, { type: 'resync', symbol: 'ETHUSD' });
    const snapshot = await messageOfType(session, 'snapshot');
    expect(snapshot).toMatchObject({ symbol: 'ETHUSD', sequence: 1, price: 3_000 });
    session.socket.close();
  });

  it('reports malformed messages without closing the connection', async () => {
    const session = await connect(issue('user-i'));
    send(session, 'not json');
    send(session, { type: 'subscribe', symbols: [] });
    await eventually(() => (session.inbox.filter((message) => message.code === 'invalid_message').length === 2 ? true : undefined));
    expect(session.socket.readyState).toBe(WebSocket.OPEN);
    session.socket.close();
  });

  it('closes a connection that sends a message above the size cap', async () => {
    const session = await connect(issue('user-j'));
    const closed = new Promise<number>((resolve) => session.socket.once('close', (code) => resolve(code)));
    send(session, 'x'.repeat(5_000));
    await expect(closed).resolves.toBe(1009);
  });
});
