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
