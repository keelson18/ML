-- Quantuam trade foundation schema.
-- This migration adds new domain tables without changing or deleting the legacy tables.

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  name text,
  asset_class text NOT NULL CHECK (asset_class IN ('crypto', 'forex', 'commodity', 'index', 'stock')),
  base_asset text,
  quote_asset text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol, asset_class)
);

CREATE TABLE IF NOT EXISTS markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  market_type text NOT NULL,
  session_timezone text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, provider)
);

CREATE TABLE IF NOT EXISTS timeframes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  seconds integer NOT NULL CHECK (seconds > 0),
  label text NOT NULL
);

CREATE TABLE IF NOT EXISTS candles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  timeframe_id uuid NOT NULL REFERENCES timeframes(id) ON DELETE RESTRICT,
  timestamp timestamptz NOT NULL,
  open numeric NOT NULL CHECK (open > 0),
  high numeric NOT NULL CHECK (high > 0),
  low numeric NOT NULL CHECK (low > 0),
  close numeric NOT NULL CHECK (close > 0),
  volume numeric NOT NULL CHECK (volume >= 0),
  source text NOT NULL,
  quality_status text NOT NULL DEFAULT 'unverified' CHECK (quality_status IN ('unverified', 'valid', 'invalid', 'stale')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, timeframe_id, timestamp, source),
  CHECK (high >= open AND high >= close AND high >= low),
  CHECK (low <= open AND low <= close AND low <= high)
);

CREATE TABLE IF NOT EXISTS market_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  timeframe_id uuid NOT NULL REFERENCES timeframes(id) ON DELETE RESTRICT,
  timestamp timestamptz NOT NULL,
  regime text,
  trend_state text,
  volatility_state text,
  structure_state text,
  liquidity_state text,
  context_version text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, timeframe_id, timestamp, context_version)
);

CREATE TABLE IF NOT EXISTS strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS strategy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id uuid NOT NULL REFERENCES strategies(id) ON DELETE RESTRICT,
  version text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'research', 'validated', 'paper', 'approved', 'retired')),
  logic_definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (strategy_id, version)
);

CREATE TABLE IF NOT EXISTS trade_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  timeframe_id uuid NOT NULL REFERENCES timeframes(id) ON DELETE RESTRICT,
  market_context_id uuid REFERENCES market_contexts(id) ON DELETE RESTRICT,
  strategy_version_id uuid REFERENCES strategy_versions(id) ON DELETE RESTRICT,
  decision_type text NOT NULL CHECK (decision_type IN ('BUY', 'SELL', 'HOLD', 'WATCH', 'NO_TRADE')),
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  risk_score numeric CHECK (risk_score >= 0 AND risk_score <= 1),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'approved', 'rejected', 'executed', 'expired')),
  decision_version text NOT NULL,
  reasoning jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS decision_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL REFERENCES trade_decisions(id) ON DELETE RESTRICT,
  source_type text NOT NULL,
  source_id uuid,
  direction text CHECK (direction IN ('bullish', 'bearish', 'neutral', 'unknown')),
  weight numeric NOT NULL DEFAULT 0,
  score numeric,
  explanation text NOT NULL,
  engine_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS paper_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  name text NOT NULL,
  base_currency text NOT NULL DEFAULT 'USD',
  starting_balance numeric NOT NULL CHECK (starting_balance >= 0),
  current_balance numeric NOT NULL CHECK (current_balance >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS paper_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES paper_accounts(id) ON DELETE RESTRICT,
  decision_id uuid NOT NULL REFERENCES trade_decisions(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  order_type text NOT NULL CHECK (order_type IN ('market', 'limit', 'stop')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  limit_price numeric CHECK (limit_price > 0),
  stop_price numeric CHECK (stop_price > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'filled', 'partially_filled', 'cancelled', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  filled_at timestamptz
);

CREATE TABLE IF NOT EXISTS paper_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES paper_accounts(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  side text NOT NULL CHECK (side IN ('long', 'short')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  average_entry_price numeric NOT NULL CHECK (average_entry_price > 0),
  stop_loss numeric CHECK (stop_loss > 0),
  take_profit numeric CHECK (take_profit > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS paper_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES paper_accounts(id) ON DELETE RESTRICT,
  decision_id uuid NOT NULL REFERENCES trade_decisions(id) ON DELETE RESTRICT,
  position_id uuid REFERENCES paper_positions(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  entry_price numeric NOT NULL CHECK (entry_price > 0),
  exit_price numeric CHECK (exit_price > 0),
  quantity numeric NOT NULL CHECK (quantity > 0),
  fees numeric NOT NULL DEFAULT 0 CHECK (fees >= 0),
  slippage numeric NOT NULL DEFAULT 0 CHECK (slippage >= 0),
  realized_pnl numeric,
  execution_version text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS risk_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES paper_accounts(id) ON DELETE RESTRICT,
  rule_version text NOT NULL,
  max_risk_per_trade numeric NOT NULL CHECK (max_risk_per_trade >= 0),
  max_exposure numeric NOT NULL CHECK (max_exposure >= 0),
  max_daily_loss numeric NOT NULL CHECK (max_daily_loss >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id)
);

CREATE TABLE IF NOT EXISTS risk_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid REFERENCES trade_decisions(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES paper_orders(id) ON DELETE RESTRICT,
  check_type text NOT NULL,
  result text NOT NULL CHECK (result IN ('approved', 'rejected', 'warning')),
  limit_value numeric,
  observed_value numeric,
  rule_version text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (decision_id IS NOT NULL OR order_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  before_state jsonb,
  after_state jsonb,
  correlation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candles_asset_time ON candles(asset_id, timeframe_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_contexts_asset_time ON market_contexts(asset_id, timeframe_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_asset_time ON trade_decisions(asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_account_created ON paper_orders(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_account_closed ON paper_trades(account_id, closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_checks_decision ON risk_checks(decision_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id, created_at DESC);

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeframes ENABLE ROW LEVEL SECURITY;
ALTER TABLE candles ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_market_foundation" ON assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_markets" ON markets FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_timeframes" ON timeframes FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_candles" ON candles FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_contexts" ON market_contexts FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_strategies" ON strategies FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_strategy_versions" ON strategy_versions FOR SELECT TO authenticated USING (true);

CREATE POLICY "users_manage_own_decisions" ON trade_decisions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_read_own_evidence" ON decision_evidence FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM trade_decisions d WHERE d.id = decision_id AND d.user_id = auth.uid()));
CREATE POLICY "users_manage_own_accounts" ON paper_accounts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_manage_own_profiles" ON risk_profiles FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_read_own_orders" ON paper_orders FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM paper_accounts a WHERE a.id = account_id AND a.user_id = auth.uid()));
CREATE POLICY "users_read_own_positions" ON paper_positions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM paper_accounts a WHERE a.id = account_id AND a.user_id = auth.uid()));
CREATE POLICY "users_read_own_trades" ON paper_trades FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM paper_accounts a WHERE a.id = account_id AND a.user_id = auth.uid()));
CREATE POLICY "users_read_own_risk_checks" ON risk_checks FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM trade_decisions d WHERE d.id = decision_id AND d.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM paper_orders o JOIN paper_accounts a ON a.id = o.account_id WHERE o.id = order_id AND a.user_id = auth.uid())
  );
CREATE POLICY "users_read_own_audit_logs" ON audit_logs FOR SELECT TO authenticated
  USING (actor_id = auth.uid());