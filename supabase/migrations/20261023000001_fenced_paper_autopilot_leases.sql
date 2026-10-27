CREATE TABLE public.paper_autopilot_leases (
  account_id uuid PRIMARY KEY REFERENCES public.paper_autopilot(account_id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  fencing_token bigint NOT NULL CHECK (fencing_token > 0),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.paper_autopilot_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.paper_autopilot_leases FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_paper_autopilot_lease(p_account_id uuid, p_owner_id uuid, p_lease_ms integer)
RETURNS TABLE(fencing_token bigint, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token bigint;
  v_expires timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_account_id IS NULL OR p_owner_id IS NULL
    OR p_lease_ms NOT BETWEEN 10000 AND 300000 THEN
    RAISE EXCEPTION 'invalid paper-autopilot lease request' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.paper_autopilot WHERE account_id = p_account_id AND enabled
    UNION ALL
    SELECT 1 FROM public.paper_sim_accounts account
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(account.state->'positions') = 'array' THEN account.state->'positions' ELSE '[]'::jsonb END
      ) AS positions(value)
      WHERE account.account_id = p_account_id::text AND positions.value->>'status' = 'open'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.paper_autopilot_leases(account_id, owner_id, fencing_token, expires_at)
    VALUES (p_account_id, p_owner_id, 1, clock_timestamp() + make_interval(secs => p_lease_ms / 1000.0))
    ON CONFLICT (account_id) DO NOTHING
    RETURNING paper_autopilot_leases.fencing_token, paper_autopilot_leases.expires_at INTO v_token, v_expires;
  IF NOT FOUND THEN
    UPDATE public.paper_autopilot_leases
      SET owner_id = p_owner_id, fencing_token = paper_autopilot_leases.fencing_token + 1,
          expires_at = clock_timestamp() + make_interval(secs => p_lease_ms / 1000.0), updated_at = clock_timestamp()
      WHERE account_id = p_account_id AND expires_at <= clock_timestamp()
      RETURNING paper_autopilot_leases.fencing_token, paper_autopilot_leases.expires_at INTO v_token, v_expires;
  END IF;
  IF v_token IS NOT NULL THEN RETURN QUERY SELECT v_token, v_expires; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.renew_paper_autopilot_lease(
  p_account_id uuid, p_owner_id uuid, p_fencing_token bigint, p_lease_ms integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_account_id IS NULL OR p_owner_id IS NULL
    OR p_fencing_token IS NULL OR p_lease_ms NOT BETWEEN 10000 AND 300000 THEN
    RAISE EXCEPTION 'invalid paper-autopilot lease renewal' USING ERRCODE = '42501';
  END IF;
  UPDATE public.paper_autopilot_leases
    SET expires_at = clock_timestamp() + make_interval(secs => p_lease_ms / 1000.0), updated_at = clock_timestamp()
    WHERE account_id = p_account_id AND owner_id = p_owner_id AND fencing_token = p_fencing_token
      AND expires_at > clock_timestamp();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_paper_autopilot_lease(p_account_id uuid, p_owner_id uuid, p_fencing_token bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_account_id IS NULL OR p_owner_id IS NULL OR p_fencing_token IS NULL THEN
    RAISE EXCEPTION 'invalid paper-autopilot lease release' USING ERRCODE = '42501';
  END IF;
  UPDATE public.paper_autopilot_leases SET expires_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE account_id = p_account_id AND owner_id = p_owner_id AND fencing_token = p_fencing_token;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_paper_autopilot_lease(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_paper_autopilot_lease(uuid, uuid, bigint, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_paper_autopilot_lease(uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_paper_autopilot_lease(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_paper_autopilot_lease(uuid, uuid, bigint, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_paper_autopilot_lease(uuid, uuid, bigint) TO service_role;

DROP FUNCTION public.record_paper_account_update(text, bigint, jsonb, jsonb);
CREATE FUNCTION public.record_paper_account_update(
  p_account_id text,
  p_expected_version bigint,
  p_state jsonb,
  p_events jsonb,
  p_lease_owner_id uuid DEFAULT NULL,
  p_lease_fencing_token bigint DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_current_state jsonb;
  v_current_version bigint;
  v_next_version bigint;
  v_event jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' OR p_account_id IS NULL OR jsonb_typeof(p_state) IS DISTINCT FROM 'object' OR jsonb_typeof(p_events) IS DISTINCT FROM 'array'
    OR ((p_lease_owner_id IS NULL) <> (p_lease_fencing_token IS NULL)) THEN
    RAISE EXCEPTION 'invalid paper account update';
  END IF;
  IF p_lease_owner_id IS NOT NULL THEN
    PERFORM 1 FROM public.paper_autopilot_leases
      WHERE account_id = p_account_id::uuid AND owner_id = p_lease_owner_id
        AND fencing_token = p_lease_fencing_token AND expires_at > clock_timestamp()
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'paper-autopilot lease lost; stale worker write rejected' USING ERRCODE = '55000'; END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_account_id, 0));
  SELECT state, version INTO v_current_state, v_current_version FROM public.paper_sim_accounts
    WHERE account_id = p_account_id FOR UPDATE;

  IF NOT FOUND THEN
    IF p_expected_version <> -1 THEN RETURN -1; END IF;
    INSERT INTO public.paper_sim_accounts(account_id, state, version) VALUES (p_account_id, p_state, 0);
    PERFORM public.append_decision_ledger_event(p_account_id, 'account-state:0', 'account.snapshot', p_state);
    FOR v_event IN SELECT value FROM jsonb_array_elements(p_events) LOOP
      PERFORM public.append_decision_ledger_event(p_account_id, v_event->>'idempotencyKey', v_event->>'eventType', v_event->'payload');
      PERFORM public.record_paper_ledger_projection(p_account_id, v_event);
    END LOOP;
    RETURN 0;
  END IF;

  IF v_current_version <> p_expected_version THEN RETURN -1; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.decision_ledger WHERE account_id = p_account_id) THEN
    PERFORM public.append_decision_ledger_event(p_account_id, 'account-backfill:v1', 'account.backfill', v_current_state);
  END IF;
  v_next_version := v_current_version + 1;
  FOR v_event IN SELECT value FROM jsonb_array_elements(p_events) LOOP
    PERFORM public.append_decision_ledger_event(p_account_id, v_event->>'idempotencyKey', v_event->>'eventType', v_event->'payload');
    PERFORM public.record_paper_ledger_projection(p_account_id, v_event);
  END LOOP;
  IF (SELECT max(created_at) FROM public.decision_ledger WHERE account_id = p_account_id AND event_type IN ('account.snapshot','account.backfill')) IS NULL
    OR (SELECT max(created_at) FROM public.decision_ledger WHERE account_id = p_account_id AND event_type IN ('account.snapshot','account.backfill')) < date_trunc('day', now())
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_events) e WHERE e->>'eventType' IN ('paper.fill','paper.fill.exit')) THEN
    PERFORM public.append_decision_ledger_event(p_account_id, 'account-state:' || v_next_version::text, 'account.snapshot', p_state);
  END IF;
  UPDATE public.paper_sim_accounts SET state = p_state, version = v_next_version WHERE account_id = p_account_id;
  RETURN v_next_version;
END;
$$;

REVOKE ALL ON FUNCTION public.record_paper_account_update(text, bigint, jsonb, jsonb, uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_paper_account_update(text, bigint, jsonb, jsonb, uuid, bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.verify_paper_schema()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  required_tables text[] := ARRAY[
    'paper_sim_accounts','decision_ledger','paper_fills','shadow_trades','paper_autopilot','autopilot_settings',
    'paper_ledger_verification_checkpoints','research_experiments','research_runs','research_results','research_approvals',
    'research_holdout_claims','strategy_promotions','research_collection_state','research_collection_candles',
    'ml_model_artifacts','paper_autopilot_leases'
  ];
  required_rpcs text[] := ARRAY[
    'record_paper_account_update','set_paper_autopilot','list_enabled_paper_autopilots','pause_paper_autopilot',
    'resume_paper_autopilot','touch_paper_autopilot_run','paper_ledger_health','paper_accounting_health',
    'admin_reverify_paper_ledger','admin_record_health_audit','admin_record_access_denial','verify_decision_ledger',
    'get_paper_autopilot_limits','record_research_run','approve_research_strategy','reject_overlapping_research_holdout',
    'validate_research_holdout_registration','append_research_collection_batch','claim_paper_autopilot_lease',
    'renew_paper_autopilot_lease','release_paper_autopilot_lease','verify_paper_schema'
  ];
  required_triggers text[] := ARRAY[
    'research_holdout_no_overlap','research_experiment_holdout_registration','research_collection_candles_immutable',
    'research_collection_candles_no_truncate','research_runs_immutable','research_results_immutable',
    'research_experiment_immutable_after_run','ml_model_artifacts_no_update_delete','ml_model_artifacts_no_truncate'
  ];
  missing text[] := ARRAY[]::text[];
  item text;
  target_table text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service role required' USING ERRCODE = '42501'; END IF;
  FOREACH item IN ARRAY required_tables LOOP
    IF to_regclass('public.' || item) IS NULL THEN missing := array_append(missing, 'table:' || item); END IF;
  END LOOP;
  FOREACH item IN ARRAY required_rpcs LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = item) THEN
      missing := array_append(missing, 'rpc:' || item);
    END IF;
  END LOOP;
  FOREACH item IN ARRAY required_triggers LOOP
    target_table := CASE
      WHEN item = 'research_holdout_no_overlap' THEN 'research_holdout_claims'
      WHEN item IN ('research_experiment_holdout_registration','research_experiment_immutable_after_run') THEN 'research_experiments'
      WHEN item = 'research_runs_immutable' THEN 'research_runs'
      WHEN item = 'research_results_immutable' THEN 'research_results'
      WHEN item LIKE 'ml_model_artifacts_%' THEN 'ml_model_artifacts'
      ELSE 'research_collection_candles'
    END;
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger trigger_row
      WHERE trigger_row.tgname = item AND trigger_row.tgrelid = to_regclass('public.' || target_table)
        AND NOT trigger_row.tgisinternal
    ) THEN missing := array_append(missing, 'trigger:' || item); END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', cardinality(missing) = 0, 'missing', missing);
END;
$$;
REVOKE ALL ON FUNCTION public.verify_paper_schema() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_paper_schema() TO service_role;
