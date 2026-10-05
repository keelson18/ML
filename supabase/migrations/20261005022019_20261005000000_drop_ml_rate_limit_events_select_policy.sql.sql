/*
# Drop ml_rate_limit_events SELECT Policy

## Purpose
The `authenticated_read_ml_rate_limits` policy uses `USING (true)` on a table
that was deliberately service-role-only. The table's privileges were revoked
so the policy currently does nothing, but a future `GRANT SELECT` would expose
rate-limit keys to all authenticated users. Drop the policy to prevent that.

## Security
- Removes the overly-permissive SELECT policy.
- The table remains RLS-enabled with no SELECT policy — only the service role can read it.
*/

DROP POLICY IF EXISTS "authenticated_read_ml_rate_limits" ON public.ml_rate_limit_events;
