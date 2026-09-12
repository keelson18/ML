-- Complete the remaining Quantuam trade Database Bible domains.
-- Analytical and audit writes remain service-controlled; user-facing records are owner-scoped.

CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'admin', 'researcher', 'reviewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS ticks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  timestamp timestamptz NOT NULL,
  bid numeric CHECK (bid > 0),
  ask numeric CHECK (ask > 0),
  last_price numeric NOT NULL CHECK (last_price > 0),
  volume numeric NOT NULL DEFAULT 0 CHECK (volume >= 0),
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ask IS NULL OR bid IS NULL OR ask >= bid)
);

CREATE TABLE IF NOT EXISTS market_regimes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  timeframe_id uuid NOT NULL REFERENCES timeframes(id) ON DELETE RESTRICT,
  regime_type text NOT NULL,
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  detector_version text NOT NULL,
  CHECK (end_time IS NULL OR end_time >= start_time)
);

CREATE TABLE IF NOT EXISTS structure_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  timeframe_id uuid NOT NULL REFERENCES timeframes(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  price numeric NOT NULL CHECK (price > 0),
  timestamp timestamptz NOT NULL,
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  detector_version text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS liquidity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  timeframe_id uuid NOT NULL REFERENCES timeframes(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  price numeric NOT NULL CHECK (price > 0),
  timestamp timestamptz NOT NULL,
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  observed boolean NOT NULL DEFAULT false,
  detector_version text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  version text NOT NULL,
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);

CREATE TABLE IF NOT EXISTS pattern_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id uuid NOT NULL REFERENCES patterns(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  timeframe_id uuid NOT NULL REFERENCES timeframes(id) ON DELETE RESTRICT,
  detected_at timestamptz NOT NULL,
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  detector_version text NOT NULL
);

CREATE TABLE IF NOT EXISTS indicator_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  version text NOT NULL,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);

CREATE TABLE IF NOT EXISTS indicator_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id uuid NOT NULL REFERENCES indicator_definitions(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  timeframe_id uuid NOT NULL REFERENCES timeframes(id) ON DELETE RESTRICT,
  observed_at timestamptz NOT NULL,
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_context_id uuid REFERENCES market_contexts(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS strategy_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_version_id uuid NOT NULL REFERENCES strategy_versions(id) ON DELETE RESTRICT,
  dataset_id text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  trade_count integer NOT NULL DEFAULT 0 CHECK (trade_count >= 0),
  total_return numeric NOT NULL DEFAULT 0,
  max_drawdown numeric NOT NULL DEFAULT 0,
  sharpe numeric,
  win_rate numeric CHECK (win_rate >= 0 AND win_rate <= 1),
  expectancy numeric,
  stability_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluation_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS trade_setups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  timeframe_id uuid NOT NULL REFERENCES timeframes(id) ON DELETE RESTRICT,
  market_context_id uuid REFERENCES market_contexts(id) ON DELETE RESTRICT,
  thesis jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'selected', 'rejected', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trade_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_trade_id uuid NOT NULL REFERENCES paper_trades(id) ON DELETE RESTRICT,
  thesis_quality text NOT NULL,
  execution_quality text NOT NULL,
  risk_quality text NOT NULL,
  market_condition text,
  outcome_class text NOT NULL,
  lessons jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (paper_trade_id, review_version)
);

CREATE TABLE IF NOT EXISTS portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  name text NOT NULL,
  base_currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portfolio_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity >= 0),
  average_entry_price numeric NOT NULL CHECK (average_entry_price > 0),
  current_price numeric NOT NULL CHECK (current_price > 0),
  exposure numeric NOT NULL DEFAULT 0,
  unrealized_pnl numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portfolio_id, asset_id)
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE RESTRICT,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  equity numeric NOT NULL CHECK (equity >= 0),
  cash numeric NOT NULL CHECK (cash >= 0),
  exposure numeric NOT NULL DEFAULT 0,
  drawdown numeric NOT NULL DEFAULT 0,
  unrealized_pnl numeric NOT NULL DEFAULT 0,
  realized_pnl numeric NOT NULL DEFAULT 0,
  risk_metrics jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS risk_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES paper_accounts(id) ON DELETE RESTRICT,
  portfolio_id uuid REFERENCES portfolios(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  observed_value numeric,
  limit_value numeric,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (account_id IS NOT NULL OR portfolio_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS system_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  correlation_id uuid,
  resource_type text,
  resource_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticks_asset_time ON ticks(asset_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_regimes_asset_time ON market_regimes(asset_id, timeframe_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_structure_asset_time ON structure_events(asset_id, timeframe_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_liquidity_asset_time ON liquidity_events(asset_id, timeframe_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_asset_time ON pattern_events(asset_id, timeframe_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_indicators_asset_time ON indicator_observations(asset_id, timeframe_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_strategy_evaluations_version ON strategy_evaluations(strategy_version_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_reviews_trade ON trade_reviews(paper_trade_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_portfolio_time ON portfolio_snapshots(portfolio_id, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_events_account_time ON risk_events(account_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_resource_time ON system_events(resource_type, resource_id, created_at DESC);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticks ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_regimes ENABLE ROW LEVEL SECURITY;
ALTER TABLE structure_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE liquidity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicator_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE indicator_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_setups ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_roles" ON user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "authenticated_read_market_events" ON ticks FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_intelligence_events" ON market_regimes FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_structure_events" ON structure_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_liquidity_events" ON liquidity_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_patterns" ON patterns FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_pattern_events" ON pattern_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_indicator_definitions" ON indicator_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_indicator_observations" ON indicator_observations FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_strategy_evaluations" ON strategy_evaluations FOR SELECT TO authenticated USING (true);
CREATE POLICY "users_manage_own_trade_setups" ON trade_setups FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "users_read_own_trade_reviews" ON trade_reviews FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM paper_trades t
    JOIN paper_accounts a ON a.id = t.account_id
    WHERE t.id = paper_trade_id AND a.user_id = auth.uid()
  ));
CREATE POLICY "users_manage_own_portfolios" ON portfolios FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "users_read_own_portfolio_positions" ON portfolio_positions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM portfolios p WHERE p.id = portfolio_id AND p.user_id = auth.uid()));
CREATE POLICY "users_read_own_portfolio_snapshots" ON portfolio_snapshots FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM portfolios p WHERE p.id = portfolio_id AND p.user_id = auth.uid()));
CREATE POLICY "users_read_own_risk_events" ON risk_events FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM paper_accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM portfolios p WHERE p.id = portfolio_id AND p.user_id = auth.uid())
  );
CREATE POLICY "users_read_system_events" ON system_events FOR SELECT TO authenticated USING (false);