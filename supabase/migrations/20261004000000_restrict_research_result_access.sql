DROP POLICY IF EXISTS "users_create_model_evaluations" ON public.model_evaluations;
DROP POLICY IF EXISTS "admins_create_model_evaluations" ON public.model_evaluations;
CREATE POLICY "admins_create_model_evaluations" ON public.model_evaluations FOR INSERT
  TO authenticated WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "read_strategy_results" ON public.strategy_results;
CREATE POLICY "read_shared_strategy_results" ON public.strategy_results FOR SELECT
  TO anon USING (user_id IS NULL);
CREATE POLICY "read_shared_or_own_strategy_results" ON public.strategy_results FOR SELECT
  TO authenticated USING (user_id IS NULL OR user_id = auth.uid());
