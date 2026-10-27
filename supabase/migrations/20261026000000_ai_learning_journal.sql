CREATE TABLE public.ai_learning_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE CHECK (length(event_key) BETWEEN 1 AND 200),
  user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN (
    'trade_analysis_completed',
    'research_experiment_created',
    'research_experiment_collecting',
    'research_experiment_completed',
    'research_experiment_failed',
    'research_strategy_promoted',
    'manual_learning_note'
  )),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  detail text NOT NULL CHECK (length(detail) BETWEEN 1 AND 4000),
  symbol text,
  timeframe text,
  source_service text NOT NULL CHECK (length(source_service) BETWEEN 1 AND 100),
  correlation_id text,
  related_records jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(related_records) = 'object'),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_learning_journal_user_created_idx ON public.ai_learning_journal(user_id, created_at DESC);
CREATE INDEX ai_learning_journal_type_created_idx ON public.ai_learning_journal(event_type, created_at DESC);
CREATE INDEX ai_learning_journal_symbol_created_idx ON public.ai_learning_journal(symbol, created_at DESC);

ALTER TABLE public.ai_learning_journal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_learning_journal FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.ai_learning_journal TO authenticated;

CREATE POLICY ai_learning_journal_owner_read ON public.ai_learning_journal FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY ai_learning_journal_admin_read ON public.ai_learning_journal FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

CREATE POLICY admins_read_research_runs ON public.research_runs FOR SELECT TO authenticated
  USING (public.is_current_user_admin());
CREATE POLICY admins_read_research_results ON public.research_results FOR SELECT TO authenticated
  USING (public.is_current_user_admin());
CREATE POLICY admins_read_research_collection_state ON public.research_collection_state FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

CREATE OR REPLACE FUNCTION public.append_ai_learning_journal_event(p_event jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_event IS NULL OR jsonb_typeof(p_event) IS DISTINCT FROM 'object'
    OR octet_length(p_event::text) > 16000
    OR length(coalesce(p_event->>'event_key', '')) NOT BETWEEN 1 AND 200
    OR length(coalesce(p_event->>'title', '')) NOT BETWEEN 1 AND 200
    OR length(coalesce(p_event->>'detail', '')) NOT BETWEEN 1 AND 4000
    OR length(coalesce(p_event->>'source_service', '')) NOT BETWEEN 1 AND 100
    OR p_event->>'event_type' NOT IN (
      'trade_analysis_completed', 'research_experiment_created', 'research_experiment_collecting',
      'research_experiment_completed', 'research_experiment_failed', 'research_strategy_promoted',
      'manual_learning_note'
    )
    OR jsonb_typeof(coalesce(p_event->'related_records', '{}'::jsonb)) IS DISTINCT FROM 'object'
    OR jsonb_typeof(coalesce(p_event->'evidence', '{}'::jsonb)) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid AI Learning journal event' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ai_learning_journal (
    event_key, user_id, event_type, title, detail, symbol, timeframe,
    source_service, correlation_id, related_records, evidence
  ) VALUES (
    p_event->>'event_key',
    nullif(p_event->>'user_id', '')::uuid,
    p_event->>'event_type',
    p_event->>'title',
    p_event->>'detail',
    nullif(p_event->>'symbol', ''),
    nullif(p_event->>'timeframe', ''),
    p_event->>'source_service',
    nullif(p_event->>'correlation_id', ''),
    coalesce(p_event->'related_records', '{}'::jsonb),
    coalesce(p_event->'evidence', '{}'::jsonb)
  ) ON CONFLICT (event_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.ai_learning_journal WHERE event_key = p_event->>'event_key';
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.append_ai_learning_journal_event(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_ai_learning_journal_event(jsonb) TO service_role;
