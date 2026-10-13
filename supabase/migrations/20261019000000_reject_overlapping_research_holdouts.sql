-- Serialize holdout claims by market/timeframe and reject any intersecting interval.
-- Existing claims are preserved; a new overlapping claim fails closed.

CREATE OR REPLACE FUNCTION public.reject_overlapping_research_holdout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.test_end_time <= NEW.test_start_time THEN
    RAISE EXCEPTION 'research holdout interval must have a positive duration' USING ERRCODE = '22023';
  END IF;

  -- Same market/timeframe claims serialize, including concurrent transactions.
  PERFORM pg_advisory_xact_lock(hashtextextended('research-holdout:' || NEW.symbol || ':' || NEW.timeframe, 0));

  IF EXISTS (
    SELECT 1
    FROM public.research_holdout_claims claim
    WHERE claim.symbol = NEW.symbol
      AND claim.timeframe = NEW.timeframe
      AND int8range(claim.test_start_time, claim.test_end_time, '[)')
          && int8range(NEW.test_start_time, NEW.test_end_time, '[)')
  ) THEN
    RAISE EXCEPTION 'research holdout overlaps a previously claimed interval for % %', NEW.symbol, NEW.timeframe
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_overlapping_research_holdout() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS research_holdout_no_overlap ON public.research_holdout_claims;
CREATE TRIGGER research_holdout_no_overlap
  BEFORE INSERT ON public.research_holdout_claims
  FOR EACH ROW EXECUTE FUNCTION public.reject_overlapping_research_holdout();

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
    'reject_overlapping_research_holdout','verify_paper_schema'
  ];
  required_triggers text[] := ARRAY['research_holdout_no_overlap'];
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
  FOREACH item IN ARRAY required_triggers LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger trigger_row
      WHERE trigger_row.tgname = item
        AND trigger_row.tgrelid = 'public.research_holdout_claims'::regclass
        AND NOT trigger_row.tgisinternal
    ) THEN missing := array_append(missing, 'trigger:' || item); END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', cardinality(missing) = 0, 'missing', missing);
END;
$$;
REVOKE ALL ON FUNCTION public.verify_paper_schema() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_paper_schema() TO service_role;
