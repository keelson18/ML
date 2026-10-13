-- Server-owned, append-only research evidence and evidence-backed setup promotion.

CREATE TABLE IF NOT EXISTS public.strategy_promotions (
  setup_type text PRIMARY KEY,
  experiment_id uuid NOT NULL REFERENCES public.research_experiments(id) ON DELETE RESTRICT,
  run_id uuid NOT NULL REFERENCES public.research_runs(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('active', 'retired')),
  approved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL DEFAULT now(),
  rollback_run_id uuid REFERENCES public.research_runs(id) ON DELETE RESTRICT,
  UNIQUE (run_id)
);

CREATE TABLE IF NOT EXISTS public.research_holdout_claims (
  experiment_id uuid PRIMARY KEY REFERENCES public.research_experiments(id) ON DELETE RESTRICT,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  dataset_id text NOT NULL,
  test_start_time bigint NOT NULL,
  test_end_time bigint NOT NULL CHECK (test_end_time > test_start_time),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol, timeframe, test_start_time, test_end_time)
);
ALTER TABLE public.research_holdout_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_holdout_claims FROM anon, authenticated, service_role;

ALTER TABLE public.strategy_promotions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_active_strategy_promotions" ON public.strategy_promotions;
CREATE POLICY "read_active_strategy_promotions" ON public.strategy_promotions
  FOR SELECT TO authenticated USING (status = 'active');
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.strategy_promotions FROM anon, authenticated, service_role;
GRANT SELECT ON public.strategy_promotions TO authenticated, service_role;

-- A persisted run/result is never client-authored or editable through user-scoped REST.
DROP POLICY IF EXISTS "users_create_research_runs" ON public.research_runs;
DROP POLICY IF EXISTS "users_create_research_results" ON public.research_results;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.research_runs, public.research_results FROM anon, authenticated;
GRANT SELECT ON public.research_runs, public.research_results TO authenticated;

DROP POLICY IF EXISTS "users_manage_own_research_experiments" ON public.research_experiments;
CREATE POLICY "users_read_own_research_experiments" ON public.research_experiments
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "users_create_own_research_drafts" ON public.research_experiments
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND status = 'draft');
CREATE POLICY "users_update_own_research_drafts" ON public.research_experiments
  FOR UPDATE TO authenticated USING (user_id = auth.uid() AND status = 'draft')
  WITH CHECK (user_id = auth.uid() AND status = 'draft');
CREATE POLICY "users_delete_own_unrun_research_drafts" ON public.research_experiments
  FOR DELETE TO authenticated USING (user_id = auth.uid() AND status = 'draft');

CREATE OR REPLACE FUNCTION public.prevent_research_experiment_mutation_after_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.research_runs WHERE experiment_id = OLD.id) THEN
    RAISE EXCEPTION 'research experiment is immutable after a run is recorded' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_research_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'persisted research run evidence is immutable' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS research_runs_immutable ON public.research_runs;
CREATE TRIGGER research_runs_immutable BEFORE UPDATE OR DELETE ON public.research_runs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_research_evidence_mutation();
DROP TRIGGER IF EXISTS research_results_immutable ON public.research_results;
CREATE TRIGGER research_results_immutable BEFORE UPDATE OR DELETE ON public.research_results
  FOR EACH ROW EXECUTE FUNCTION public.prevent_research_evidence_mutation();

DROP TRIGGER IF EXISTS research_experiment_immutable_after_run ON public.research_experiments;
CREATE TRIGGER research_experiment_immutable_after_run
  BEFORE UPDATE OR DELETE ON public.research_experiments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_research_experiment_mutation_after_run();

CREATE OR REPLACE FUNCTION public.record_research_run(
  p_experiment_id uuid,
  p_user_id uuid,
  p_run_version text,
  p_seed bigint,
  p_configuration jsonb,
  p_metrics jsonb,
  p_artifacts jsonb,
  p_conclusion text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_run_id uuid;
  v_started_at timestamptz := now();
  v_existing_configuration jsonb;
  v_existing_metrics jsonb;
  v_existing_artifacts jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF octet_length(coalesce(p_artifacts, '{}'::jsonb)::text) > 2000000 THEN
    RAISE EXCEPTION 'research artifacts exceed the 2MB persistence limit' USING ERRCODE = '22023';
  END IF;
  -- Serialize retries per experiment so simultaneous identical runs observe the first commit.
  PERFORM 1 FROM public.research_experiments
    WHERE id = p_experiment_id AND user_id = p_user_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'owned research experiment not found' USING ERRCODE = '42501';
  END IF;
  SELECT run.id, run.configuration, result.metrics, result.artifacts
    INTO v_run_id, v_existing_configuration, v_existing_metrics, v_existing_artifacts
    FROM public.research_runs run
    JOIN public.research_experiments experiment ON experiment.id = run.experiment_id AND experiment.user_id = p_user_id
    JOIN public.research_results result ON result.run_id = run.id
    WHERE run.experiment_id = p_experiment_id AND run.run_version = p_run_version;
  IF v_run_id IS NOT NULL THEN
    IF (v_existing_configuration - 'datasetVersions') = (p_configuration - 'datasetVersions')
      AND v_existing_metrics = p_metrics
      AND (v_existing_artifacts - 'datasetVersions') = (p_artifacts - 'datasetVersions') THEN
      RETURN v_run_id;
    END IF;
    RAISE EXCEPTION 'research run version already exists with different evidence' USING ERRCODE = '23505';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.research_experiments
    WHERE id = p_experiment_id AND user_id = p_user_id AND status = 'draft'
  ) THEN
    RAISE EXCEPTION 'owned draft research experiment not found' USING ERRCODE = '42501';
  END IF;
  UPDATE public.research_experiments SET status = 'completed'
    WHERE id = p_experiment_id AND user_id = p_user_id;
  INSERT INTO public.research_runs (experiment_id, run_version, seed, configuration, status, started_at, completed_at)
    VALUES (p_experiment_id, p_run_version, p_seed, p_configuration, 'completed', v_started_at, now())
    RETURNING id INTO v_run_id;
  INSERT INTO public.research_holdout_claims (experiment_id, symbol, timeframe, dataset_id, test_start_time, test_end_time)
    VALUES (p_experiment_id, p_artifacts->>'symbol', p_artifacts->>'triggerTimeframe', p_artifacts->>'datasetId',
      (p_artifacts #>> '{split,testStartTime}')::bigint, (p_artifacts #>> '{split,testEndTime}')::bigint);
  INSERT INTO public.research_results (run_id, metrics, artifacts, conclusion)
    VALUES (v_run_id, p_metrics, p_artifacts, p_conclusion);
  RETURN v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_research_run(uuid, uuid, text, bigint, jsonb, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_research_run(uuid, uuid, text, bigint, jsonb, jsonb, jsonb, text) TO service_role;

CREATE OR REPLACE FUNCTION public.approve_research_strategy(
  p_experiment_id uuid,
  p_run_id uuid,
  p_reviewer_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_setup_type text;
  v_metrics jsonb;
  v_artifacts jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_reviewer_id AND role = 'admin') THEN
    RAISE EXCEPTION 'administrator approval required' USING ERRCODE = '42501';
  END IF;
  SELECT e.parameters->>'setupType', result.metrics, result.artifacts
    INTO v_setup_type, v_metrics, v_artifacts
    FROM public.research_experiments e
    JOIN public.research_runs run ON run.experiment_id = e.id AND run.id = p_run_id AND run.status = 'completed'
    JOIN public.research_results result ON result.run_id = run.id
    WHERE e.id = p_experiment_id AND e.status = 'completed';
  IF v_setup_type IS NULL OR coalesce(v_artifacts #>> '{validation,passed}', 'false') <> 'true'
    OR coalesce(v_artifacts #>> '{validation,promotionEligible}', 'false') <> 'true'
    OR coalesce((v_metrics->>'tradeCount')::integer, 0) < 1 THEN
    RAISE EXCEPTION 'stored research run has not passed server validation' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.strategy_promotions (setup_type, experiment_id, run_id, status, approved_by, rollback_run_id)
    VALUES (v_setup_type, p_experiment_id, p_run_id, 'active', p_reviewer_id,
      (SELECT run_id FROM public.strategy_promotions WHERE setup_type = v_setup_type AND status = 'active'))
  ON CONFLICT (setup_type) DO UPDATE SET
    experiment_id = EXCLUDED.experiment_id, run_id = EXCLUDED.run_id,
    status = 'active', approved_by = EXCLUDED.approved_by,
    approved_at = now(), rollback_run_id = strategy_promotions.run_id;
  INSERT INTO public.research_approvals (experiment_id, decision, reviewer_id, notes)
    VALUES (p_experiment_id, 'approved', p_reviewer_id, 'Server validation passed for immutable research run ' || p_run_id::text);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_research_strategy(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_research_strategy(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.verify_paper_schema()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  required_tables text[] := ARRAY[
    'paper_sim_accounts','decision_ledger','paper_fills','shadow_trades','paper_autopilot',
    'autopilot_settings','paper_ledger_verification_checkpoints','research_experiments',
    'research_runs','research_results','research_holdout_claims','strategy_promotions'
  ];
  required_rpcs text[] := ARRAY[
    'record_paper_account_update','set_paper_autopilot','list_enabled_paper_autopilots',
    'pause_paper_autopilot','resume_paper_autopilot','touch_paper_autopilot_run',
    'paper_ledger_health','paper_accounting_health','admin_reverify_paper_ledger',
    'admin_record_health_audit','admin_record_access_denial','verify_decision_ledger',
    'get_paper_autopilot_limits','record_research_run','approve_research_strategy','verify_paper_schema'
  ];
  missing text[] := ARRAY[]::text[];
  item text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  FOREACH item IN ARRAY required_tables LOOP
    IF to_regclass('public.' || item) IS NULL THEN missing := array_append(missing, 'table:' || item); END IF;
  END LOOP;
  FOREACH item IN ARRAY required_rpcs LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = item) THEN
      missing := array_append(missing, 'rpc:' || item);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', cardinality(missing) = 0, 'missing', missing);
END;
$$;
REVOKE ALL ON FUNCTION public.verify_paper_schema() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_paper_schema() TO service_role;
