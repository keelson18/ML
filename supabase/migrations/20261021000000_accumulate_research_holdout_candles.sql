-- Persist provider candles incrementally so forward 15m holdouts can exceed
-- any single provider response limit without moving the registered boundary.
CREATE TABLE public.research_collection_state (
  experiment_id uuid PRIMARY KEY REFERENCES public.research_experiments(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  symbol text NOT NULL,
  provider text NOT NULL,
  continuous boolean NOT NULL,
  test_start_time bigint NOT NULL,
  initialized_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.research_collection_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_collection_state FROM anon, authenticated, service_role;
GRANT SELECT ON public.research_collection_state TO service_role;

CREATE TABLE public.research_collection_candles (
  experiment_id uuid NOT NULL REFERENCES public.research_experiments(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  symbol text NOT NULL,
  timeframe text NOT NULL CHECK (timeframe IN ('15m', '1h', '4h', '1d')),
  candle_time bigint NOT NULL,
  candle jsonb NOT NULL CHECK (jsonb_typeof(candle) = 'object'),
  provider text NOT NULL,
  source_data_version text NOT NULL,
  source_fetched_at timestamptz NOT NULL,
  PRIMARY KEY (experiment_id, timeframe, candle_time)
);

ALTER TABLE public.research_collection_candles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_collection_candles FROM anon, authenticated, service_role;
GRANT SELECT ON public.research_collection_candles TO service_role;

CREATE OR REPLACE FUNCTION public.append_research_collection_batch(
  p_experiment_id uuid,
  p_user_id uuid,
  p_symbol text,
  p_continuous boolean,
  p_series jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_parameters jsonb;
  v_status text;
  v_test_start bigint;
  v_first_collection boolean;
  v_state_symbol text;
  v_state_provider text;
  v_state_continuous boolean;
  v_state_start bigint;
  v_series jsonb;
  v_candle jsonb;
  v_existing jsonb;
  v_timeframe text;
  v_provider text;
  v_data_version text;
  v_fetched_at timestamptz;
  v_step bigint;
  v_time bigint;
  v_open numeric;
  v_high numeric;
  v_low numeric;
  v_close numeric;
  v_volume numeric;
  v_previous_input bigint;
  v_latest_stored bigint;
  v_total integer;
  v_first_time bigint;
  v_last_time bigint;
  v_new integer := 0;
  v_seen text[] := ARRAY[]::text[];
  v_providers text[] := ARRAY[]::text[];
  v_counts jsonb := '{}'::jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF nullif(p_symbol, '') IS NULL OR p_series IS NULL OR jsonb_typeof(p_series) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'research collection batch is invalid or too large' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_series) <> 4 OR octet_length(p_series::text) > 4000000 THEN
    RAISE EXCEPTION 'research collection batch is invalid or too large' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('research-collection:' || p_experiment_id::text, 0));
  SELECT experiment.parameters, experiment.status
    INTO v_parameters, v_status
    FROM public.research_experiments experiment
    WHERE experiment.id = p_experiment_id AND experiment.user_id = p_user_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'owned research experiment not found' USING ERRCODE = '42501'; END IF;
  IF v_status NOT IN ('draft', 'completed') THEN RAISE EXCEPTION 'research experiment is not collectable' USING ERRCODE = '55000'; END IF;
  IF jsonb_typeof(v_parameters->'testStartTime') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'registered test boundary is missing' USING ERRCODE = '22023';
  END IF;
  v_test_start := (v_parameters->>'testStartTime')::bigint;
  SELECT state.symbol, state.provider, state.continuous, state.test_start_time
    INTO v_state_symbol, v_state_provider, v_state_continuous, v_state_start
    FROM public.research_collection_state state WHERE state.experiment_id = p_experiment_id FOR UPDATE;
  v_first_collection := NOT FOUND;
  IF v_first_collection AND extract(epoch FROM clock_timestamp()) >= v_test_start THEN
    RAISE EXCEPTION 'research collection must be initialized before the registered holdout starts' USING ERRCODE = '55000';
  END IF;

  FOR v_series IN SELECT value FROM jsonb_array_elements(p_series) LOOP
    v_timeframe := v_series->>'timeframe';
    v_provider := nullif(v_series->>'provider', '');
    v_data_version := nullif(v_series->>'dataVersion', '');
    v_fetched_at := to_timestamp((v_series->>'fetchedAt')::numeric / 1000);
    v_step := CASE v_timeframe WHEN '15m' THEN 900 WHEN '1h' THEN 3600 WHEN '4h' THEN 14400 WHEN '1d' THEN 86400 ELSE NULL END;
    IF v_step IS NULL OR v_timeframe = ANY(v_seen) OR v_provider IS NULL OR v_data_version IS NULL
      OR jsonb_typeof(v_series->'candles') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'research collection timeframe or provenance is invalid' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(v_series->'candles') < 1 OR jsonb_array_length(v_series->'candles') > 1000 THEN
      RAISE EXCEPTION 'research collection timeframe or provenance is invalid' USING ERRCODE = '22023';
    END IF;
    v_seen := array_append(v_seen, v_timeframe);
    v_providers := array_append(v_providers, v_provider);
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_series->'candles') AS candles(item)
      WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
        OR NOT (item ?& ARRAY['time','open','high','low','close','volume'])
        OR jsonb_typeof(item->'time') IS DISTINCT FROM 'number'
        OR jsonb_typeof(item->'open') IS DISTINCT FROM 'number' OR jsonb_typeof(item->'high') IS DISTINCT FROM 'number'
        OR jsonb_typeof(item->'low') IS DISTINCT FROM 'number' OR jsonb_typeof(item->'close') IS DISTINCT FROM 'number'
        OR jsonb_typeof(item->'volume') IS DISTINCT FROM 'number'
    ) THEN RAISE EXCEPTION 'research candle schema is invalid' USING ERRCODE = '22023'; END IF;

    SELECT max(candle_time) INTO v_latest_stored
      FROM public.research_collection_candles
      WHERE experiment_id = p_experiment_id AND timeframe = v_timeframe;
    v_previous_input := NULL;
    FOR v_candle IN SELECT candles.item FROM jsonb_array_elements(v_series->'candles') AS candles(item) ORDER BY (candles.item->>'time')::bigint LOOP
      v_time := (v_candle->>'time')::bigint;
      v_open := (v_candle->>'open')::numeric;
      v_high := (v_candle->>'high')::numeric;
      v_low := (v_candle->>'low')::numeric;
      v_close := (v_candle->>'close')::numeric;
      v_volume := (v_candle->>'volume')::numeric;
      IF (v_candle->>'time')::numeric <> trunc((v_candle->>'time')::numeric)
        OR v_time < 0 OR mod(v_time, v_step) <> 0 OR v_time + v_step > extract(epoch FROM clock_timestamp())
        OR v_open <= 0 OR v_high <= 0 OR v_low <= 0 OR v_close <= 0 OR v_volume < 0
        OR v_high < greatest(v_open, v_close, v_low) OR v_low > least(v_open, v_close, v_high)
        OR (v_previous_input IS NOT NULL AND v_time <= v_previous_input) THEN
        RAISE EXCEPTION 'research candle is invalid, open, misaligned, or unordered' USING ERRCODE = '22023';
      END IF;
      IF p_continuous AND v_previous_input IS NOT NULL AND v_time <> v_previous_input + v_step THEN
        RAISE EXCEPTION 'research provider snapshot contains a candle gap' USING ERRCODE = '22023';
      END IF;
      v_previous_input := v_time;

      SELECT candle INTO v_existing FROM public.research_collection_candles
        WHERE experiment_id = p_experiment_id AND timeframe = v_timeframe AND candle_time = v_time;
      IF FOUND THEN
        IF v_existing IS DISTINCT FROM v_candle THEN
          RAISE EXCEPTION 'provider revised an already collected research candle' USING ERRCODE = '55000';
        END IF;
        CONTINUE;
      END IF;
      IF v_status = 'completed' THEN RAISE EXCEPTION 'completed research collections are immutable' USING ERRCODE = '55000'; END IF;
      IF p_continuous AND v_latest_stored IS NOT NULL AND v_time > v_latest_stored AND v_time <> v_latest_stored + v_step THEN
        RAISE EXCEPTION 'research collection missed provider candles; create a new experiment' USING ERRCODE = '22023';
      END IF;
      IF v_latest_stored IS NOT NULL AND v_time < v_latest_stored THEN
        RAISE EXCEPTION 'late historical research candle cannot be appended' USING ERRCODE = '55000';
      END IF;
      INSERT INTO public.research_collection_candles (
        experiment_id, user_id, symbol, timeframe, candle_time, candle,
        provider, source_data_version, source_fetched_at
      ) VALUES (
        p_experiment_id, p_user_id, p_symbol, v_timeframe, v_time, v_candle,
        v_provider, v_data_version, v_fetched_at
      );
      v_latest_stored := greatest(coalesce(v_latest_stored, v_time), v_time);
      v_new := v_new + 1;
    END LOOP;
    SELECT count(*), min(candle_time), max(candle_time) INTO v_total, v_first_time, v_last_time FROM public.research_collection_candles
      WHERE experiment_id = p_experiment_id AND timeframe = v_timeframe;
    v_counts := v_counts || jsonb_build_object(v_timeframe,
      jsonb_build_object('bars', v_total, 'firstTime', v_first_time, 'lastTime', v_last_time));
  END LOOP;
  IF cardinality(v_seen) <> 4 OR cardinality(ARRAY(SELECT DISTINCT provider FROM unnest(v_providers) AS providers(provider))) <> 1 THEN
    RAISE EXCEPTION 'research collection must contain the four required timeframes from one provider' USING ERRCODE = '22023';
  END IF;
  IF v_first_collection THEN
    INSERT INTO public.research_collection_state (experiment_id, user_id, symbol, provider, continuous, test_start_time)
      VALUES (p_experiment_id, p_user_id, p_symbol, v_providers[1], p_continuous, v_test_start);
  ELSIF v_state_symbol <> p_symbol OR v_state_provider <> v_providers[1]
    OR v_state_continuous IS DISTINCT FROM p_continuous OR v_state_start <> v_test_start THEN
    RAISE EXCEPTION 'research collection identity changed after initialization' USING ERRCODE = '55000';
  END IF;
  IF v_first_collection AND p_continuous AND (
    coalesce((v_counts #>> '{15m,bars}')::integer, 0) < 200 OR coalesce((v_counts #>> '{1h,bars}')::integer, 0) < 50
    OR coalesce((v_counts #>> '{4h,bars}')::integer, 0) < 50 OR coalesce((v_counts #>> '{1d,bars}')::integer, 0) < 50
  ) THEN RAISE EXCEPTION 'initial research baseline is too short for planner warmup' USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO v_total FROM public.research_collection_candles WHERE experiment_id = p_experiment_id;
  IF v_total > 20000 THEN RAISE EXCEPTION 'research collection exceeded its 20000-candle storage bound' USING ERRCODE = '54000'; END IF;
  RETURN jsonb_build_object('newCandles', v_new, 'counts', v_counts, 'initialized', true);
END;
$$;

REVOKE ALL ON FUNCTION public.append_research_collection_batch(uuid, uuid, text, boolean, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_research_collection_batch(uuid, uuid, text, boolean, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_research_collection_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'research collection candles are immutable' USING ERRCODE = '55000';
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_research_collection_mutation() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER research_collection_candles_immutable
  BEFORE UPDATE OR DELETE ON public.research_collection_candles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_research_collection_mutation();
CREATE TRIGGER research_collection_candles_no_truncate
  BEFORE TRUNCATE ON public.research_collection_candles
  FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_research_collection_mutation();

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
    'research_runs','research_results','research_approvals','research_holdout_claims','strategy_promotions',
    'research_collection_state','research_collection_candles'
  ];
  required_rpcs text[] := ARRAY[
    'record_paper_account_update','set_paper_autopilot','list_enabled_paper_autopilots',
    'pause_paper_autopilot','resume_paper_autopilot','touch_paper_autopilot_run',
    'paper_ledger_health','paper_accounting_health','admin_reverify_paper_ledger',
    'admin_record_health_audit','admin_record_access_denial','verify_decision_ledger',
    'get_paper_autopilot_limits','record_research_run','approve_research_strategy',
    'reject_overlapping_research_holdout','validate_research_holdout_registration',
    'append_research_collection_batch','verify_paper_schema'
  ];
  required_triggers text[] := ARRAY[
    'research_holdout_no_overlap','research_experiment_holdout_registration','research_collection_candles_immutable',
    'research_collection_candles_no_truncate'
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
      WHEN item = 'research_experiment_holdout_registration' THEN 'research_experiments'
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
