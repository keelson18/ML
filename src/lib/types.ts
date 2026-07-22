export type Side = 'buy' | 'sell' | 'neutral';

export type Timeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' | '1M';

export type UserRole = 'user' | 'admin';

export type MarketType = 'crypto' | 'forex' | 'commodity' | 'index' | 'stock';

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Signal {
  strategy: string;
  side: Side;
  confidence: number; // 0..1
  reason: string;
  overlays?: Overlay[];
}

export interface Overlay {
  type: 'line' | 'hline' | 'markers' | 'zone';
  id: string;
  points?: { time: number; value: number }[];
  price?: number;
  from?: number;
  to?: number;
  color?: string;
  label?: string;
  markers?: { time: number; position: 'aboveBar' | 'belowBar' | 'inBar'; color: string; shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown'; text?: string }[];
}

export interface StrategyResult {
  symbol: string;
  strategy: string;
  timeframe: Timeframe;
  winRate: number;
  confidence: number;
  sampleSize: number;
  lastRun: string;
  payload: Record<string, unknown>;
}

export interface MLPrediction {
  pair: string;
  timeframe: Timeframe;
  prediction: 'up' | 'down' | 'flat';
  probability: number;
  expected_move_pct: number;
  model_version: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface Recommendation {
  symbol: string;
  timeframe: Timeframe;
  side: Side;
  score: number; // -1..1
  contributors: { source: string; side: Side; weight: number; confidence: number; reason: string }[];
  stopLoss?: number;
  takeProfit?: number;
  entry?: number;
  atr?: number;
  updatedAt: number;
}

export interface Market {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  marketType: MarketType;
  exchange: string;
  label: string;
  provider: string;
  category?: string;
  sector?: string;
  isActive: boolean;
}

// User profile with role
export interface UserProfile {
  id: string;
  role: UserRole;
  displayName?: string;
  avatarUrl?: string;
  createdAt: string;
}

// CMS content types
export type CMSContentType = 'article' | 'guide' | 'announcement' | 'docs' | 'faq';

export interface CMSContent {
  id: string;
  slug: string;
  title: string;
  body: string;
  excerpt?: string;
  contentType: CMSContentType;
  authorId?: string;
  tags: string[];
  published: boolean;
  publishedAt?: string;
  featuredImage?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const TRACKED_PAIRS = [
  { symbol: 'BTCUSDT', label: 'BTC/USDT', marketType: 'crypto' as MarketType },
  { symbol: 'ETHUSDT', label: 'ETH/USDT', marketType: 'crypto' as MarketType },
  { symbol: 'SOLUSDT', label: 'SOL/USDT', marketType: 'crypto' as MarketType },
  { symbol: 'BNBUSDT', label: 'BNB/USDT', marketType: 'crypto' as MarketType },
  { symbol: 'ADAUSDT', label: 'ADA/USDT', marketType: 'crypto' as MarketType },
  { symbol: 'XRPUSDT', label: 'XRP/USDT', marketType: 'crypto' as MarketType },
  { symbol: 'DOTUSDT', label: 'DOT/USDT', marketType: 'crypto' as MarketType },
] as const;

export const TIMEFRAMES: { value: Timeframe; label: string; binance: string }[] = [
  { value: '1m', label: '1m', binance: '1m' },
  { value: '3m', label: '3m', binance: '3m' },
  { value: '5m', label: '5m', binance: '5m' },
  { value: '15m', label: '15m', binance: '15m' },
  { value: '30m', label: '30m', binance: '30m' },
  { value: '1h', label: '1h', binance: '1h' },
  { value: '4h', label: '4h', binance: '4h' },
  { value: '1d', label: '1d', binance: '1d' },
  { value: '1w', label: '1w', binance: '1w' },
  { value: '1M', label: '1M', binance: '1M' },
];

// Market categories for multi-market support
export const MARKET_TYPES: { value: MarketType; label: string; icon: string }[] = [
  { value: 'crypto', label: 'Cryptocurrencies', icon: '₿' },
  { value: 'forex', label: 'Forex', icon: '💱' },
  { value: 'commodity', label: 'Commodities', icon: '🛢️' },
  { value: 'index', label: 'Indices', icon: '📊' },
  { value: 'stock', label: 'Stocks', icon: '📈' },
];
