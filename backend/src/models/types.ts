export interface UserProfile {
  id: string;
  role: 'user' | 'admin';
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface CMSContent {
  id: string;
  slug: string;
  title: string;
  body: string;
  excerpt: string | null;
  content_type: 'article' | 'guide' | 'announcement' | 'docs' | 'faq';
  author_id: string | null;
  tags: string[];
  published: boolean;
  published_at: string | null;
  featured_image: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MLPrediction {
  pair: string;
  timeframe: string;
  prediction: 'up' | 'down' | 'flat';
  probability: number;
  expected_move_pct: number;
  model_version: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface Position {
  id: string;
  user_id: string;
  symbol: string;
  side: 'long' | 'short';
  entry_price: number;
  size: number;
  stop_loss: number | null;
  take_profit: number | null;
  status: 'open' | 'closed';
  market_type: string;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
}

export interface Trade {
  id: string;
  user_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  fee: number;
  pnl: number;
  market_type: string;
  executed_at: string;
  created_at: string;
}

export interface SystemMetric {
  id: string;
  metric_name: string;
  metric_value: number;
  metric_unit: string;
  recorded_at: string;
}

export interface AuthResult {
  session: { access_token: string; refresh_token: string; expires_at: number };
  user: { id: string; email: string };
  profile: UserProfile;
}

export interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
