/*
# Phase 2: Platform & Role Management

## New Tables
1. profiles — Extended user profiles with role
2. cms_content — CMS articles and content
3. market_universe — All supported markets

## Existing Table Modifications
- Add market_type to positions and trades tables
*/

-- 1. Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "select_all_profiles_admin" ON profiles;
CREATE POLICY "select_all_profiles_admin" ON profiles FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "update_any_profile_admin" ON profiles;
CREATE POLICY "update_any_profile_admin" ON profiles FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (true);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, role, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 2. CMS Content table
CREATE TABLE IF NOT EXISTS cms_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  excerpt text,
  content_type text NOT NULL DEFAULT 'article' CHECK (content_type IN ('article', 'guide', 'announcement', 'docs', 'faq')),
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tags text[] DEFAULT '{}',
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  featured_image text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cms_content ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cms_slug ON cms_content(slug);
CREATE INDEX IF NOT EXISTS idx_cms_type ON cms_content(content_type);
CREATE INDEX IF NOT EXISTS idx_cms_published ON cms_content(published) WHERE published = true;

DROP POLICY IF EXISTS "read_published_cms" ON cms_content;
CREATE POLICY "read_published_cms" ON cms_content FOR SELECT
  TO anon, authenticated USING (published = true);
DROP POLICY IF EXISTS "read_all_cms_admin" ON cms_content;
CREATE POLICY "read_all_cms_admin" ON cms_content FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
DROP POLICY IF EXISTS "insert_cms_admin" ON cms_content;
CREATE POLICY "insert_cms_admin" ON cms_content FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
DROP POLICY IF EXISTS "update_cms_admin" ON cms_content;
CREATE POLICY "update_cms_admin" ON cms_content FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
DROP POLICY IF EXISTS "delete_cms_admin" ON cms_content;
CREATE POLICY "delete_cms_admin" ON cms_content FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 3. Market Universe table
CREATE TABLE IF NOT EXISTS market_universe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  base_asset text NOT NULL,
  quote_asset text NOT NULL,
  market_type text NOT NULL CHECK (market_type IN ('crypto', 'forex', 'commodity', 'index', 'stock')),
  exchange text NOT NULL,
  provider text NOT NULL DEFAULT 'binance',
  label text NOT NULL,
  category text,
  sector text,
  is_active boolean NOT NULL DEFAULT true,
  min_size numeric,
  tick_size numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE market_universe ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_symbol_exchange ON market_universe(symbol, exchange);
CREATE INDEX IF NOT EXISTS idx_market_type ON market_universe(market_type);
CREATE INDEX IF NOT EXISTS idx_market_active ON market_universe(is_active) WHERE is_active = true;

DROP POLICY IF EXISTS "read_market_universe" ON market_universe;
CREATE POLICY "read_market_universe" ON market_universe FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "insert_market_universe" ON market_universe;
CREATE POLICY "insert_market_universe" ON market_universe FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_market_universe" ON market_universe;
CREATE POLICY "update_market_universe" ON market_universe FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- 4. Add market_type to positions
ALTER TABLE positions ADD COLUMN IF NOT EXISTS market_type text DEFAULT 'crypto' CHECK (market_type IN ('crypto', 'forex', 'commodity', 'index', 'stock'));

-- 5. Add market_type to trades
ALTER TABLE trades ADD COLUMN IF NOT EXISTS market_type text DEFAULT 'crypto' CHECK (market_type IN ('crypto', 'forex', 'commodity', 'index', 'stock'));

-- 6. System metrics table for admin dashboard
CREATE TABLE IF NOT EXISTS system_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name text NOT NULL,
  metric_value numeric NOT NULL,
  metric_unit text DEFAULT '',
  tags jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE system_metrics ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_metrics_name ON system_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_metrics_recorded ON system_metrics(recorded_at);

DROP POLICY IF EXISTS "read_system_metrics_admin" ON system_metrics;
CREATE POLICY "read_system_metrics_admin" ON system_metrics FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
DROP POLICY IF EXISTS "insert_system_metrics" ON system_metrics;
CREATE POLICY "insert_system_metrics" ON system_metrics FOR INSERT
  TO authenticated WITH CHECK (true);

