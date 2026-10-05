-- Keep rate-limit keys and event data service-role-only.
DROP POLICY IF EXISTS "authenticated_read_ml_rate_limits" ON public.ml_rate_limit_events;
