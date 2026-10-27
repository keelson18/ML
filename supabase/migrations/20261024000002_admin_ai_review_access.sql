-- Restrict model and learning review data to administrators and audit admin notes.

DROP POLICY IF EXISTS "read_models" ON public.models;
CREATE POLICY "admins_read_models" ON public.models FOR SELECT TO authenticated
  USING (public.is_current_user_admin());
DROP POLICY IF EXISTS "users_create_models" ON public.models;
DROP POLICY IF EXISTS "read_model_versions" ON public.model_versions;
DROP POLICY IF EXISTS "users_create_research_models" ON public.model_versions;
CREATE POLICY "admins_read_model_versions" ON public.model_versions FOR SELECT TO authenticated
  USING (public.is_current_user_admin());
DROP POLICY IF EXISTS "read_model_evaluations" ON public.model_evaluations;
DROP POLICY IF EXISTS "users_create_model_evaluations" ON public.model_evaluations;
CREATE POLICY "admins_read_model_evaluations" ON public.model_evaluations FOR SELECT TO authenticated
  USING (public.is_current_user_admin());
DROP POLICY IF EXISTS "read_model_deployments" ON public.model_deployments;
CREATE POLICY "admins_read_model_deployments" ON public.model_deployments FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

CREATE POLICY "admins_read_learning_events" ON public.learning_events FOR SELECT TO authenticated
  USING (public.is_current_user_admin());
CREATE POLICY "admins_read_learning_experiments" ON public.learning_experiments FOR SELECT TO authenticated
  USING (public.is_current_user_admin());
CREATE POLICY "admins_read_learning_outcomes" ON public.learning_outcomes FOR SELECT TO authenticated
  USING (public.is_current_user_admin());
CREATE POLICY "admins_read_research_experiments" ON public.research_experiments FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

CREATE OR REPLACE FUNCTION public.admin_create_learning_event(
  p_source_type text,
  p_source_id uuid,
  p_observation jsonb,
  p_hypothesis text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING errcode = '42501';
  END IF;
  IF p_source_type NOT IN ('paper_trade', 'research', 'risk_event', 'data_quality')
    OR p_hypothesis IS NULL OR length(trim(p_hypothesis)) NOT BETWEEN 1 AND 2000
    OR p_observation IS NULL OR pg_column_size(p_observation) > 16000 THEN
    RAISE EXCEPTION 'Invalid learning event.' USING errcode = '22023';
  END IF;
  INSERT INTO public.learning_events(user_id, source_type, source_id, observation, hypothesis, status)
    VALUES (v_actor, p_source_type, p_source_id, p_observation, trim(p_hypothesis), 'hypothesis')
    RETURNING id INTO v_id;
  INSERT INTO public.admin_audit_events(actor_id, action, details)
    VALUES (v_actor, 'ai_learning_event_created', jsonb_build_object('event_id', v_id, 'source_type', p_source_type));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_create_learning_event(text, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_learning_event(text, uuid, jsonb, text) TO authenticated;

COMMENT ON TABLE public.model_versions IS 'Administrator-only model review registry.';
COMMENT ON TABLE public.learning_events IS 'Owner-scoped learning notes; administrators may review all records.';
COMMENT ON TABLE public.research_experiments IS 'Owner-scoped experiments; administrators may review all records.';
