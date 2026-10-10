import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backoffDelayMs, CoinbaseFeed, COINBASE_WS_URL } from './coinbase-feed';
import type { LiveSocket, SocketEvent } from './socket';
import type { FeedStatus, Tick } from './types';

class FakeSocket implements LiveSocket {
  readonly sent: Array<Record<string, unknown>> = [];
  closeCalls = 0;
  private readonly listeners = new Map<SocketEvent, Array<(data?: unknown) => void>>();

  on(event: SocketEvent, listener: (data?: unknown) => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(): void {
    this.closeCalls += 1;
  }

  emit(event: SocketEvent, data?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(data);
  }
}

function tickerMessage(sequence: number, products: Array<[string, string]>, timestamp = '2026-10-10T12:00:00.500Z'): string {
  return JSON.stringify({
    channel: 'ticker',
    timestamp,
    sequence_num: sequence,
    events: [{ type: 'update', tickers: products.map(([product_id, price]) => ({ product_id, price })) }],
  });
}

function heartbeat(sequence: number): string {
  return JSON.stringify({ channel: 'heartbeats', timestamp: '2026-10-10T12:00:01Z', sequence_num: sequence, events: [] });
}

describe('Coinbase live feed', () => {
  let sockets: FakeSocket[];
  let clock: number;
  let feed: CoinbaseFeed;
  const statuses: FeedStatus[] = [];

  function build(options: { maxSymbols?: number; staleMs?: number } = {}): CoinbaseFeed {
    return new CoinbaseFeed({
      maxSymbols: options.maxSymbols ?? 20,
      staleMs: options.staleMs ?? 10_000,
      createSocket: (url) => {
        expect(url).toBe(COINBASE_WS_URL);
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      now: () => clock,
      random: () => 0.5,
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    clock = 1_000_000;
    statuses.length = 0;
    feed = build();
    feed.onStatus((status) => statuses.push(status));
  });

  afterEach(async () => {
    await feed.close();
    vi.useRealTimers();
  });

  function openSocket(index = sockets.length - 1): FakeSocket {
    const socket = sockets[index] as FakeSocket;
    socket.emit('open');
    return socket;
  }

  it('supports only symbols with a Coinbase product mapping', () => {
    expect(feed.supports('BTCUSD')).toBe(true);
    expect(feed.supports('EURUSD')).toBe(false);
    expect(feed.supports('SPX500')).toBe(false);
  });

  it('subscribes to ticker and heartbeats after connecting and reports connected', () => {
    feed.subscribe(['BTCUSD', 'ETHUSD']);
    const socket = openSocket();
    expect(feed.status()).toBe('connected');
    expect(socket.sent).toEqual([
      { type: 'subscribe', channel: 'ticker', product_ids: ['BTC-USD', 'ETH-USD'] },
      { type: 'subscribe', channel: 'heartbeats' },
    ]);
  });

  it('emits ticks with internal symbols and ignores unsubscribed products', () => {
    const ticks: Tick[] = [];
    feed.onTick((tick) => ticks.push(tick));
    feed.subscribe(['BTCUSD']);
    const socket = openSocket();
    socket.emit('message', tickerMessage(1, [['BTC-USD', '67000.5'], ['ETH-USD', '3000']]));
    expect(ticks).toEqual([{ symbol: 'BTCUSD', price: 67000.5, volume: null, timestamp: Date.parse('2026-10-10T12:00:00.500Z') }]);
    expect(feed.diagnostics().ticks).toBe(1);
  });

  it('counts and ignores malformed messages without emitting', () => {
    const ticks: Tick[] = [];
    feed.onTick((tick) => ticks.push(tick));
    feed.subscribe(['BTCUSD']);
    const socket = openSocket();
    socket.emit('message', 'not json');
    socket.emit('message', JSON.stringify({ channel: 'ticker', timestamp: 'bad', sequence_num: 1, events: [] }));
    socket.emit('message', JSON.stringify({ channel: 'ticker', timestamp: '2026-10-10T12:00:00Z', sequence_num: 2, events: [{ tickers: [{ product_id: 'BTC-USD', price: -1 }] }] }));
    socket.emit('message', 42);
    expect(ticks).toEqual([]);
    expect(feed.diagnostics().malformed).toBeGreaterThanOrEqual(3);
  });

  it('drops duplicate and out-of-order messages per channel', () => {
    const ticks: Tick[] = [];
    feed.onTick((tick) => ticks.push(tick));
    feed.subscribe(['BTCUSD']);
    const socket = openSocket();
    socket.emit('message', tickerMessage(5, [['BTC-USD', '100']]));
    socket.emit('message', tickerMessage(5, [['BTC-USD', '101']]));
    socket.emit('message', tickerMessage(4, [['BTC-USD', '102']]));
    socket.emit('message', tickerMessage(6, [['BTC-USD', '103']]));
    expect(ticks.map((tick) => tick.price)).toEqual([100, 103]);
    expect(feed.diagnostics().duplicates).toBe(2);
  });

  it('enforces the subscription cap', () => {
    const capped = build({ maxSymbols: 2 });
    expect(() => capped.subscribe(['BTCUSD', 'ETHUSD', 'SOLUSD'])).toThrow('Coinbase subscriptions are limited to 2 symbols.');
  });

  it('sends unsubscribe for removed symbols and closes the socket when none remain', () => {
    feed.subscribe(['BTCUSD', 'ETHUSD']);
    const socket = openSocket();
    feed.unsubscribe(['ETHUSD']);
    expect(socket.sent.at(-1)).toEqual({ type: 'unsubscribe', channel: 'ticker', product_ids: ['ETH-USD'] });
    feed.unsubscribe(['BTCUSD']);
    expect(socket.closeCalls).toBe(1);
    expect(feed.status()).toBe('down');
  });

  it('reconnects with backoff and resubscribes after the socket closes', () => {
    feed.subscribe(['BTCUSD']);
    const first = openSocket(0);
    first.emit('close');
    expect(feed.status()).toBe('reconnecting');
    expect(sockets).toHaveLength(1);

    vi.advanceTimersByTime(backoffDelayMs(0, 1_000, 30_000, () => 0.5));
    expect(sockets).toHaveLength(2);
    const second = openSocket(1);
    expect(feed.status()).toBe('connected');
    expect(second.sent[0]).toEqual({ type: 'subscribe', channel: 'ticker', product_ids: ['BTC-USD'] });
    expect(feed.diagnostics().reconnects).toBe(1);
    expect(statuses).toEqual(['connected', 'reconnecting', 'connected']);
  });

  it('treats a socket error as a disconnect exactly once', () => {
    feed.subscribe(['BTCUSD']);
    const socket = openSocket(0);
    socket.emit('error');
    socket.emit('close');
    expect(feed.diagnostics().reconnects).toBe(1);
    expect(socket.closeCalls).toBe(1);
  });

  it('reconnects when no message arrives within the stale window', () => {
    feed.subscribe(['BTCUSD']);
    const socket = openSocket(0);
    clock += 10_001;
    vi.advanceTimersByTime(5_000);
    expect(socket.closeCalls).toBeGreaterThanOrEqual(1);
    expect(feed.status()).toBe('reconnecting');
  });

  it('keeps the connection alive while heartbeats arrive', () => {
    feed.subscribe(['BTCUSD']);
    const socket = openSocket(0);
    for (let step = 1; step <= 5; step += 1) {
      clock += 4_000;
      socket.emit('message', heartbeat(step));
      vi.advanceTimersByTime(4_000);
    }
    expect(socket.closeCalls).toBe(0);
    expect(feed.status()).toBe('connected');
  });

  it('does not reconnect after the last symbol is removed during backoff', () => {
    feed.subscribe(['BTCUSD']);
    openSocket(0).emit('close');
    feed.unsubscribe(['BTCUSD']);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    expect(feed.status()).toBe('down');
  });

  it('keeps backoff bounded and jittered', () => {
    expect(backoffDelayMs(0, 1_000, 30_000, () => 0)).toBe(500);
    expect(backoffDelayMs(0, 1_000, 30_000, () => 1)).toBe(1_000);
    expect(backoffDelayMs(20, 1_000, 30_000, () => 1)).toBe(30_000);
  });
});
