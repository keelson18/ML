/*
# Paper Sim Account User Ownership

## Purpose
Fixes the `paper_sim_accounts` table so authenticated users can read and modify
their own paper trading account state. Previously the table had RLS enabled but
zero policies, making it accessible only via the service role key.

## Changes
- REVOKE all from anon + authenticated (reset baseline).
- GRANT SELECT, INSERT, UPDATE to authenticated.
- Add 3 owner-scoped policies (SELECT, INSERT, UPDATE) keyed on account_id = auth.uid()::text.
  No DELETE policy — paper accounts should not be deletable by users.

## Security
- Each user can only access the row where account_id matches their auth.uid().
- anon role has no access.
- DELETE is intentionally not granted — accounts are persistent.
*/

REVOKE ALL ON public.paper_sim_accounts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.paper_sim_accounts TO authenticated;

DROP POLICY IF EXISTS "users_read_own_paper_sim_account" ON public.paper_sim_accounts;
CREATE POLICY "users_read_own_paper_sim_account" ON public.paper_sim_accounts FOR SELECT
  TO authenticated USING (account_id = auth.uid()::text);

DROP POLICY IF EXISTS "users_create_own_paper_sim_account" ON public.paper_sim_accounts;
CREATE POLICY "users_create_own_paper_sim_account" ON public.paper_sim_accounts FOR INSERT
  TO authenticated WITH CHECK (account_id = auth.uid()::text);

DROP POLICY IF EXISTS "users_update_own_paper_sim_account" ON public.paper_sim_accounts;
CREATE POLICY "users_update_own_paper_sim_account" ON public.paper_sim_accounts FOR UPDATE
  TO authenticated USING (account_id = auth.uid()::text)
  WITH CHECK (account_id = auth.uid()::text);
