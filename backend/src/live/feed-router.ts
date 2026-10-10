import type { FeedId, FeedStatus, LiveFeed } from './types';

export type FeedRoute =
  | { kind: 'stream'; feedId: FeedId }
  | { kind: 'polling'; reason: 'unsupported' }
  | { kind: 'polling'; reason: 'feed-unavailable'; feedId: FeedId; feedStatus: FeedStatus };

export interface FeedRouter {
  route(symbol: string): FeedRoute;
}

export function createFeedRouter(feeds: readonly LiveFeed[]): FeedRouter {
  return {
    route(symbol) {
      let unavailable: LiveFeed | undefined;
      for (const feed of feeds) {
        if (!feed.supports(symbol)) continue;
        if (feed.status() === 'connected') return { kind: 'stream', feedId: feed.id };
        unavailable ??= feed;
      }
      if (!unavailable) return { kind: 'polling', reason: 'unsupported' };
      return { kind: 'polling', reason: 'feed-unavailable', feedId: unavailable.id, feedStatus: unavailable.status() };
    },
  };
}
