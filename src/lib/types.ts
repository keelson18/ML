export type Side = 'buy' | 'sell' | 'neutral';

export type Timeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' | '1M';

export type UserRole = 'user' | 'admin';

export type MarketType = 'crypto' | 'forex' | 'commodity' | 'index' | 'stock';
export type MarketDataProvider = 'massive' | 'twelvedata';

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
  strategyId?: string;
  strategyVersion?: string;
  side: Side;
  confidence: number; // 0..1
  reason: string;
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
  expected_move_pct: number | null;
  expected_move_calibrated?: boolean;
  model_version: string;
  confidence: 'low' | 'medium' | 'high';
  edge_status?: 'no-edge' | 'beats-momentum-baseline';
  momentum_baseline_accuracy?: number;
  dataset_id?: string;
  data_end?: number;
  data_fetched_at?: number;
  prediction_timestamp?: string;
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
  canonicalSymbol?: string;
  sourceSymbol?: string;
  priceCurrency?: string;
  id?: string;
  category?: string;
  sector?: string;
  isActive: boolean;
  /** Instrument type within its asset class (e.g. spot crypto, index CFD, cash equity). */
  instrumentType?: string;
  /** Overrides the asset-class default when the venue has a distinct tick. */
  tickSize?: number;
  /** Decimal places used for display and risk rounding. */
  pricePrecision?: number;
  /** Units per contract for venues that trade contracts rather than units. */
  contractSize?: number;
  /** IANA timezone for the instrument's session calendar. */
  sessionTimezone?: string;
  /** Short selling is unavailable on the USD spot paper account unless declared. */
  shortable?: boolean;
  /** Timeframes the provider adapter can actually serve for this instrument. */
  supportedTimeframes?: string[];
  /** Operator-facing explanation when the provider mapping is missing or unsupported. */
  providerNote?: string;
}

export interface MarketDataIdentity {
  instrumentId: string;
  canonicalSymbol: string;
  sourceSymbol: string;
  provider: string;
  baseAsset: string;
  quoteAsset: string;
  marketType: MarketType;
  timeframe: Timeframe;
  startTimestamp: number | null;
  endTimestamp: number | null;
  datasetId: string;
  dataVersion: string;
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

export const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: '1m', label: '1m' },
  { value: '3m', label: '3m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '30m', label: '30m' },
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
  { value: '1d', label: '1d' },
  { value: '1w', label: '1w' },
  { value: '1M', label: '1M' },
];

// Market categories for multi-market support
export const MARKET_TYPES: { value: MarketType; label: string; icon: string }[] = [
  { value: 'crypto', label: 'Cryptocurrencies', icon: '₿' },
  { value: 'forex', label: 'Forex', icon: '⇄' },
  { value: 'commodity', label: 'Commodities', icon: '🛢️' },
  { value: 'index', label: 'Indices', icon: '▥' },
  { value: 'stock', label: 'Stocks', icon: '▤' },
];
