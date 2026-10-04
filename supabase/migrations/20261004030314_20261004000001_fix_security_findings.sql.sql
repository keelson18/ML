/*
# Fix Security Issues: Restrict Research Access, RLS Gaps, and SECURITY DEFINER Functions

## Purpose
Fixes 9 security advisor findings and applies the on-disk `restrict_research_result_access` migration that was never applied to the database.

## Changes

### 1. strategy_results: Split SELECT into anon (shared only) + authenticated (shared or own)
- Drops the old broad `read_strategy_results` policy.
- `anon` can only read rows where `user_id IS NULL` (shared analytics).
- `authenticated` can read shared rows OR their own (`user_id = auth.uid()`).

### 2. model_evaluations: Admin-only INSERT
- Drops `users_create_model_evaluations` (was non-admin INSERT).
- Creates `admins_create_model_evaluations` restricted to `is_current_user_admin()`.

### 3. ml_rate_limit_events: Add SELECT policy for authenticated
- RLS was enabled but no policies existed — table was inaccessible.
- Add `authenticated_read_ml_rate_limits` SELECT for authenticated users (rate-limit logs are operational data, not sensitive).

### 4. SECURITY DEFINER function EXECUTE revocation
- `handle_new_user()`: REVOKE from anon (trigger-only function, never called by clients).
- `prevent_profile_role_escalation()`: REVOKE from anon (trigger-only).
- `touch_paper_sim_account_updated_at()`: REVOKE from anon (trigger-only).
- `is_current_user_admin()`: REVOKE from anon (was already granted to authenticated only, but anon could also call it).

## Security
- No destructive changes. All policy drops are immediately followed by replacement creates.
- Trigger functions remain callable by the database itself (they run in trigger context, not via RPC).
- `is_current_user_admin()` remains available to `authenticated` role for RLS policy checks.
*/

-- ============================================================
-- 1. strategy_results: scoped SELECT
-- ============================================================

DROP POLICY IF EXISTS "read_strategy_results" ON public.strategy_results;
DROP POLICY IF EXISTS "read_shared_strategy_results" ON public.strategy_results;
DROP POLICY IF EXISTS "read_shared_or_own_strategy_results" ON public.strategy_results;

CREATE POLICY "read_shared_strategy_results"
ON public.strategy_results FOR SELECT
TO anon, authenticated
USING (user_id IS NULL);

CREATE POLICY "read_shared_or_own_strategy_results"
ON public.strategy_results FOR SELECT
TO authenticated
USING (user_id IS NULL OR user_id = auth.uid());

-- ============================================================
-- 2. model_evaluations: admin-only INSERT
-- ============================================================

DROP POLICY IF EXISTS "users_create_model_evaluations" ON public.model_evaluations;
DROP POLICY IF EXISTS "admins_create_model_evaluations" ON public.model_evaluations;

CREATE POLICY "admins_create_model_evaluations"
ON public.model_evaluations FOR INSERT
TO authenticated
WITH CHECK (public.is_current_user_admin());

-- ============================================================
-- 3. ml_rate_limit_events: add SELECT policy
-- ============================================================

DROP POLICY IF EXISTS "authenticated_read_ml_rate_limits" ON public.ml_rate_limit_events;

CREATE POLICY "authenticated_read_ml_rate_limits"
ON public.ml_rate_limit_events FOR SELECT
TO authenticated
USING (true);

-- ============================================================
-- 4. Revoke anon EXECUTE on SECURITY DEFINER functions
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_role_escalation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.touch_paper_sim_account_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_current_user_admin() FROM anon;
