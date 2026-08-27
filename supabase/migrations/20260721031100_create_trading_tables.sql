/*
# Create trading tables for Quantum Intelligence

1. New Tables
- `positions` — open/paper trading positions a user is tracking.
  - id (uuid pk), user_id (uuid, defaults to auth.uid()), symbol (text), side (text: long/short),
    entry_price (numeric), size (numeric), stop_loss (numeric), take_profit (numeric),
    status (text: open/closed), opened_at (timestamptz), closed_at (timestamptz), created_at.
- `trades` — historical trade records (filled orders).
  - id (uuid pk), user_id, symbol, side, price, size, fee, pnl, executed_at, created_at.
- `performance_snapshots` — periodic portfolio performance metrics per user.
  - id (uuid pk), user_id, total_pnl, win_rate, sharpe, max_drawdown, snapshot_at, created_at.
- `strategy_results` — cached backtest results per symbol+strategy+timeframe.
  - id (uuid pk), user_id nullable (null = shared/global result), symbol, strategy, timeframe,
    win_rate, confidence, sample_size, last_run, payload (jsonb), created_at.
- `ml_predictions` — cached ML predictions per symbol+timeframe.
  - id (uuid pk), symbol, timeframe, prediction, probability, expected_move_pct,
    model_version, confidence, payload (jsonb), created_at.

2. Security
- Enable RLS on every table.
- positions/trades/performance_snapshots: owner-scoped CRUD (authenticated, auth.uid() = user_id).
- strategy_results/ml_predictions: read by anon+authenticated (shared analytics), writes by
  authenticated only (service writes via edge function with service role). For simplicity here,
  allow anon+authenticated SELECT and authenticated INSERT/UPDATE/DELETE.

3. Notes
- user_id columns default to auth.uid() so client inserts omitting user_id succeed.
- Indexes on user_id and symbol for query performance.
*/

CREATE TABLE IF NOT EXISTS positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('long','short')),
  entry_price numeric NOT NULL,
  size numeric NOT NULL,
  stop_loss numeric,
  take_profit numeric,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_positions_user_id ON positions(user_id);
CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);

DROP POLICY IF EXISTS "select_own_positions" ON positions;
CREATE POLICY "select_own_positions" ON positions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_positions" ON positions;
CREATE POLICY "insert_own_positions" ON positions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_positions" ON positions;
CREATE POLICY "update_own_positions" ON positions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_positions" ON positions;
CREATE POLICY "delete_own_positions" ON positions FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('buy','sell')),
  price numeric NOT NULL,
  size numeric NOT NULL,
  fee numeric NOT NULL DEFAULT 0,
  pnl numeric NOT NULL DEFAULT 0,
  executed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);

DROP POLICY IF EXISTS "select_own_trades" ON trades;
CREATE POLICY "select_own_trades" ON trades FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_trades" ON trades;
CREATE POLICY "insert_own_trades" ON trades FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_trades" ON trades;
CREATE POLICY "update_own_trades" ON trades FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_trades" ON trades;
CREATE POLICY "delete_own_trades" ON trades FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  total_pnl numeric NOT NULL DEFAULT 0,
  win_rate numeric NOT NULL DEFAULT 0,
  sharpe numeric,
  max_drawdown numeric,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE performance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_perf_user_id ON performance_snapshots(user_id);

DROP POLICY IF EXISTS "select_own_perf" ON performance_snapshots;
CREATE POLICY "select_own_perf" ON performance_snapshots FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_perf" ON performance_snapshots;
CREATE POLICY "insert_own_perf" ON performance_snapshots FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_perf" ON performance_snapshots;
CREATE POLICY "update_own_perf" ON performance_snapshots FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_perf" ON performance_snapshots;
CREATE POLICY "delete_own_perf" ON performance_snapshots FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS strategy_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  strategy text NOT NULL,
  timeframe text NOT NULL,
  win_rate numeric NOT NULL,
  confidence numeric NOT NULL,
  sample_size integer NOT NULL DEFAULT 0,
  last_run timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE strategy_results ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_strat_symbol_tf ON strategy_results(symbol, timeframe);
CREATE UNIQUE INDEX IF NOT EXISTS idx_strat_unique ON strategy_results(symbol, strategy, timeframe, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

DROP POLICY IF EXISTS "read_strategy_results" ON strategy_results;
CREATE POLICY "read_strategy_results" ON strategy_results FOR SELECT
  TO anon, authenticated USING (true);
-- SECURITY: No INSERT/UPDATE/DELETE policies for authenticated users.
-- strategy_results is written exclusively by the service role (edge functions
-- bypass RLS by default). Client-side write access is not needed.
-- Retained only for reference: removed write policies intentionally.

CREATE TABLE IF NOT EXISTS ml_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  timeframe text NOT NULL,
  prediction text NOT NULL,
  probability numeric NOT NULL,
  expected_move_pct numeric NOT NULL DEFAULT 0,
  model_version text NOT NULL,
  confidence text NOT NULL DEFAULT 'medium',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ml_predictions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ml_symbol_tf ON ml_predictions(symbol, timeframe);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ml_unique ON ml_predictions(symbol, timeframe);

DROP POLICY IF EXISTS "read_ml_predictions" ON ml_predictions;
CREATE POLICY "read_ml_predictions" ON ml_predictions FOR SELECT
  TO anon, authenticated USING (true);
-- SECURITY: No INSERT/UPDATE/DELETE policies for authenticated users on
-- ml_predictions. Written exclusively by edge functions via service role.
-- Client-side write access is not needed.
