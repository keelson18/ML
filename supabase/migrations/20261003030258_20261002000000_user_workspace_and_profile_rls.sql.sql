/*
# User Workspace Tables, Admin Function, and Profile RLS

## Purpose
1. Create `is_current_user_admin()` SECURITY DEFINER function for admin checks.
2. Add admin-scoped RLS policies on profiles, cms_content, system_metrics.
3. Allow users to insert their own profile on signup.
4. Create `user_preferences` table (theme, notifications).
5. Create `user_watchlists` table (saved symbol lists).
6. Create `price_alerts` table (symbol/direction/target price alerts).

## New Tables
- `user_preferences` — per-user theme + notification settings, PK = user_id
- `user_watchlists` — per-user watchlist with array of symbols, PK = user_id
- `price_alerts` — per-user price alerts with above/below triggers

## Security
- `is_current_user_admin()` is SECURITY DEFINER, EXECUTE granted to authenticated only.
- Profiles: admin can read all + update any; users can insert their own (role='user' only).
- CMS: admin-only CRUD.
- System metrics: admin-only SELECT.
- User tables: owner-scoped with 4 separate CRUD policies (SELECT/INSERT/UPDATE/DELETE).
*/

-- ============================================================
-- Admin check function
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- ============================================================
-- Profile RLS policies
-- ============================================================

DROP POLICY IF EXISTS "select_all_profiles_admin" ON public.profiles;
CREATE POLICY "select_all_profiles_admin" ON public.profiles FOR SELECT
  TO authenticated USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "insert_own_profile" ON public.profiles;
CREATE POLICY "insert_own_profile" ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id AND role = 'user');

DROP POLICY IF EXISTS "update_any_profile_admin" ON public.profiles;
CREATE POLICY "update_any_profile_admin" ON public.profiles FOR UPDATE
  TO authenticated USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- ============================================================
-- CMS admin policies
-- ============================================================

DROP POLICY IF EXISTS "read_all_cms_admin" ON public.cms_content;
CREATE POLICY "read_all_cms_admin" ON public.cms_content FOR SELECT
  TO authenticated USING (public.is_current_user_admin());
DROP POLICY IF EXISTS "insert_cms_admin" ON public.cms_content;
CREATE POLICY "insert_cms_admin" ON public.cms_content FOR INSERT
  TO authenticated WITH CHECK (public.is_current_user_admin());
DROP POLICY IF EXISTS "update_cms_admin" ON public.cms_content;
CREATE POLICY "update_cms_admin" ON public.cms_content FOR UPDATE
  TO authenticated USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());
DROP POLICY IF EXISTS "delete_cms_admin" ON public.cms_content;
CREATE POLICY "delete_cms_admin" ON public.cms_content FOR DELETE
  TO authenticated USING (public.is_current_user_admin());

-- ============================================================
-- System metrics admin policy
-- ============================================================

DROP POLICY IF EXISTS "read_system_metrics_admin" ON public.system_metrics;
CREATE POLICY "read_system_metrics_admin" ON public.system_metrics FOR SELECT
  TO authenticated USING (public.is_current_user_admin());

-- ============================================================
-- user_preferences table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'dark' CHECK (theme IN ('light', 'dark')),
  notifications jsonb NOT NULL DEFAULT '{"marketAlerts":true,"news":false}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_preferences" ON public.user_preferences;
CREATE POLICY "select_own_preferences" ON public.user_preferences FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_preferences" ON public.user_preferences;
CREATE POLICY "insert_own_preferences" ON public.user_preferences FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_preferences" ON public.user_preferences;
CREATE POLICY "update_own_preferences" ON public.user_preferences FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_preferences" ON public.user_preferences;
CREATE POLICY "delete_own_preferences" ON public.user_preferences FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- user_watchlists table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_watchlists (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default Watchlist',
  symbols text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_watchlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_watchlist" ON public.user_watchlists;
CREATE POLICY "select_own_watchlist" ON public.user_watchlists FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_watchlist" ON public.user_watchlists;
CREATE POLICY "insert_own_watchlist" ON public.user_watchlists FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_watchlist" ON public.user_watchlists;
CREATE POLICY "update_own_watchlist" ON public.user_watchlists FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_watchlist" ON public.user_watchlists;
CREATE POLICY "delete_own_watchlist" ON public.user_watchlists FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- price_alerts table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.price_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('above', 'below')),
  target_price numeric NOT NULL CHECK (target_price > 0),
  active boolean NOT NULL DEFAULT true,
  triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_user_active ON public.price_alerts(user_id, active, created_at DESC);

ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_price_alerts" ON public.price_alerts;
CREATE POLICY "select_own_price_alerts" ON public.price_alerts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_price_alerts" ON public.price_alerts;
CREATE POLICY "insert_own_price_alerts" ON public.price_alerts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_price_alerts" ON public.price_alerts;
CREATE POLICY "update_own_price_alerts" ON public.price_alerts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_price_alerts" ON public.price_alerts;
CREATE POLICY "delete_own_price_alerts" ON public.price_alerts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
