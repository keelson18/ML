-- Keep the registered out-of-sample boundary future-dated and immutable after creation.
-- This lets repeated evaluations accumulate the same forward window without shifting it.

CREATE OR REPLACE FUNCTION public.validate_research_holdout_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  test_start numeric;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'research experiment registration time is immutable' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.parameters IS DISTINCT FROM OLD.parameters THEN
    RAISE EXCEPTION 'research experiment parameters are immutable after registration' USING ERRCODE = '55000';
  END IF;
  IF jsonb_typeof(NEW.parameters->'testStartTime') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'research experiment requires a registered future testStartTime' USING ERRCODE = '22023';
  END IF;
  BEGIN
    test_start := (NEW.parameters->>'testStartTime')::numeric;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'research testStartTime must be an integer Unix timestamp in seconds' USING ERRCODE = '22023';
  END;
  IF test_start <> trunc(test_start)
    OR test_start * 1000 <= extract(epoch FROM NEW.created_at) * 1000 THEN
    RAISE EXCEPTION 'research testStartTime must follow experiment registration' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "users_update_own_research_drafts" ON public.research_experiments;

REVOKE ALL ON FUNCTION public.validate_research_holdout_registration() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS research_experiment_holdout_registration ON public.research_experiments;
CREATE TRIGGER research_experiment_holdout_registration
  BEFORE INSERT OR UPDATE ON public.research_experiments
  FOR EACH ROW EXECUTE FUNCTION public.validate_research_holdout_registration();

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
    'research_runs','research_results','research_approvals','research_holdout_claims','strategy_promotions'
  ];
  required_rpcs text[] := ARRAY[
    'record_paper_account_update','set_paper_autopilot','list_enabled_paper_autopilots',
    'pause_paper_autopilot','resume_paper_autopilot','touch_paper_autopilot_run',
    'paper_ledger_health','paper_accounting_health','admin_reverify_paper_ledger',
    'admin_record_health_audit','admin_record_access_denial','verify_decision_ledger',
    'get_paper_autopilot_limits','record_research_run','approve_research_strategy',
    'reject_overlapping_research_holdout','validate_research_holdout_registration','verify_paper_schema'
  ];
  required_triggers text[] := ARRAY['research_holdout_no_overlap','research_experiment_holdout_registration'];
  missing text[] := ARRAY[]::text[];
  item text;
  target_table text;
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
  FOREACH item IN ARRAY required_triggers LOOP
    target_table := CASE WHEN item = 'research_holdout_no_overlap' THEN 'research_holdout_claims' ELSE 'research_experiments' END;
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger trigger_row
      WHERE trigger_row.tgname = item
        AND trigger_row.tgrelid = to_regclass('public.' || target_table)
        AND NOT trigger_row.tgisinternal
    ) THEN missing := array_append(missing, 'trigger:' || item); END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', cardinality(missing) = 0, 'missing', missing);
END;
$$;
REVOKE ALL ON FUNCTION public.verify_paper_schema() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_paper_schema() TO service_role;
