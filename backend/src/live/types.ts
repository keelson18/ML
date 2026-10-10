import type { Candle } from '../../../src/lib/types';

export type FeedId = 'coinbase' | 'twelvedata';
export type FeedStatus = 'connected' | 'reconnecting' | 'down';

export interface Tick {
  symbol: string;
  price: number;
  volume: number | null;
  timestamp: number;
}

export interface FormingCandle extends Candle {
  forming: true;
}

export interface FeedLimits {
  maxSymbols: number;
}

export interface LiveFeed {
  readonly id: FeedId;
  supports(symbol: string): boolean;
  subscribe(symbols: readonly string[]): void;
  unsubscribe(symbols: readonly string[]): void;
  onTick(listener: (tick: Tick) => void): () => void;
  onStatus(listener: (status: FeedStatus) => void): () => void;
  status(): FeedStatus;
  limits(): FeedLimits;
  close(): Promise<void>;
}
