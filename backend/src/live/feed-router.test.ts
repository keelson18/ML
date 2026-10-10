import { describe, expect, it } from 'vitest';
import { createFeedRouter } from './feed-router';
import type { FeedId, FeedStatus, LiveFeed } from './types';

function fakeFeed(id: FeedId, supported: readonly string[], initialStatus: FeedStatus = 'connected') {
  let status = initialStatus;
  const feed: LiveFeed & { setStatus(next: FeedStatus): void } = {
    id,
    supports: (symbol) => supported.includes(symbol),
    subscribe: () => undefined,
    unsubscribe: () => undefined,
    onTick: () => () => undefined,
    onStatus: () => () => undefined,
    status: () => status,
    limits: () => ({ maxSymbols: 8 }),
    close: async () => undefined,
    setStatus: (next) => { status = next; },
  };
  return feed;
}

describe('feed router', () => {
  it('routes each symbol to the first connected feed that supports it', () => {
    const router = createFeedRouter([fakeFeed('coinbase', ['BTCUSD']), fakeFeed('twelvedata', ['EURUSD'])]);
    expect(router.route('BTCUSD')).toEqual({ kind: 'stream', feedId: 'coinbase' });
    expect(router.route('EURUSD')).toEqual({ kind: 'stream', feedId: 'twelvedata' });
  });

  it('falls back to polling for symbols no feed supports', () => {
    const router = createFeedRouter([fakeFeed('coinbase', ['BTCUSD'])]);
    expect(router.route('SPX500')).toEqual({ kind: 'polling', reason: 'unsupported' });
  });

  it('reports polling with feed status when the supporting feed is unhealthy', () => {
    const coinbase = fakeFeed('coinbase', ['BTCUSD'], 'reconnecting');
    const router = createFeedRouter([coinbase]);
    expect(router.route('BTCUSD')).toEqual({ kind: 'polling', reason: 'feed-unavailable', feedId: 'coinbase', feedStatus: 'reconnecting' });
  });

  it('fails over to a healthy later feed and recovers when the first feed returns', () => {
    const primary = fakeFeed('coinbase', ['BTCUSD']);
    const secondary = fakeFeed('twelvedata', ['BTCUSD']);
    const router = createFeedRouter([primary, secondary]);

    expect(router.route('BTCUSD')).toEqual({ kind: 'stream', feedId: 'coinbase' });
    primary.setStatus('down');
    expect(router.route('BTCUSD')).toEqual({ kind: 'stream', feedId: 'twelvedata' });
    secondary.setStatus('down');
    expect(router.route('BTCUSD')).toEqual({ kind: 'polling', reason: 'feed-unavailable', feedId: 'coinbase', feedStatus: 'down' });
    primary.setStatus('connected');
    expect(router.route('BTCUSD')).toEqual({ kind: 'stream', feedId: 'coinbase' });
  });
});
