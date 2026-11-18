CREATE TABLE IF NOT EXISTS public.ai_research_backlog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  question text NOT NULL CHECK (length(trim(question)) BETWEEN 1 AND 2000),
  rationale text NOT NULL DEFAULT '' CHECK (length(rationale) <= 2000),
  priority text NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'blocked', 'done', 'dismissed')),
  status_note text NOT NULL DEFAULT '' CHECK (length(status_note) <= 500),
  evidence jsonb NOT NULL CHECK (
    CASE WHEN jsonb_typeof(evidence) = 'array'
      THEN jsonb_array_length(evidence) BETWEEN 1 AND 20 AND pg_column_size(evidence) <= 16000
      ELSE false
    END
  ),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_research_backlog_created
  ON public.ai_research_backlog(created_at DESC);

ALTER TABLE public.ai_research_backlog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_research_backlog FROM PUBLIC, anon;
REVOKE ALL ON public.ai_research_backlog FROM authenticated, service_role;
GRANT SELECT ON public.ai_research_backlog TO authenticated, service_role;
DROP POLICY IF EXISTS "admins_read_ai_research_backlog" ON public.ai_research_backlog;
CREATE POLICY "admins_read_ai_research_backlog" ON public.ai_research_backlog FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

CREATE OR REPLACE FUNCTION public.admin_create_ai_research_backlog(
  p_title text,
  p_question text,
  p_rationale text,
  p_priority text,
  p_evidence jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_id uuid;
  v_evidence jsonb;
  v_source_exists boolean;
BEGIN
  IF v_actor IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING errcode = '42501';
  END IF;
  IF p_title IS NULL OR length(trim(p_title)) NOT BETWEEN 1 AND 160
    OR p_question IS NULL OR length(trim(p_question)) NOT BETWEEN 1 AND 2000
    OR p_rationale IS NULL OR length(p_rationale) > 2000
    OR p_priority IS NULL OR p_priority NOT IN ('critical', 'high', 'medium', 'low')
    OR p_evidence IS NULL
    OR CASE WHEN jsonb_typeof(p_evidence) = 'array'
      THEN jsonb_array_length(p_evidence) NOT BETWEEN 1 AND 20 OR pg_column_size(p_evidence) > 16000
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(p_evidence) AS evidence_item(value)
          WHERE CASE WHEN jsonb_typeof(value) = 'object' THEN
            value - 'source_type' - 'source_id' - 'description' <> '{}'::jsonb
              OR value->>'source_type' IS NULL
              OR value->>'source_type' NOT IN ('paper_trade', 'research', 'risk_event', 'data_quality')
              OR jsonb_typeof(value->'source_id') <> 'string'
              OR value->>'source_id' IS NULL
              OR value->>'source_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$'
              OR jsonb_typeof(value->'description') <> 'string'
              OR nullif(trim(value->>'description'), '') IS NULL
              OR length(value->>'description') > 500
            ELSE true
          END
        )
      ELSE true
    END THEN
    RAISE EXCEPTION 'Invalid research backlog item.' USING errcode = '22023';
  END IF;

  FOR v_evidence IN SELECT value FROM jsonb_array_elements(p_evidence) AS evidence_item(value) LOOP
    CASE v_evidence->>'source_type'
      WHEN 'paper_trade' THEN
        SELECT EXISTS (SELECT 1 FROM public.paper_trades WHERE id = (v_evidence->>'source_id')::uuid) INTO v_source_exists;
      WHEN 'research' THEN
        SELECT EXISTS (SELECT 1 FROM public.research_experiments WHERE id = (v_evidence->>'source_id')::uuid)
          OR EXISTS (SELECT 1 FROM public.research_runs WHERE id = (v_evidence->>'source_id')::uuid)
          OR EXISTS (SELECT 1 FROM public.research_results WHERE id = (v_evidence->>'source_id')::uuid)
          INTO v_source_exists;
      WHEN 'risk_event' THEN
        SELECT EXISTS (SELECT 1 FROM public.risk_events WHERE id = (v_evidence->>'source_id')::uuid) INTO v_source_exists;
      WHEN 'data_quality' THEN
        SELECT EXISTS (SELECT 1 FROM public.system_events WHERE id = (v_evidence->>'source_id')::uuid) INTO v_source_exists;
      ELSE
        v_source_exists := false;
    END CASE;
    IF NOT v_source_exists THEN
      RAISE EXCEPTION 'Research evidence source does not exist.' USING errcode = '22023';
    END IF;
  END LOOP;

  INSERT INTO public.ai_research_backlog(title, question, rationale, priority, evidence, created_by)
    VALUES (trim(p_title), trim(p_question), trim(p_rationale), p_priority, p_evidence, v_actor)
    RETURNING id INTO v_id;
  INSERT INTO public.admin_audit_events(actor_id, action, details)
    VALUES (v_actor, 'ai_research_backlog_created', jsonb_build_object('backlog_id', v_id, 'priority', p_priority));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_ai_research_backlog_status(
  p_id uuid,
  p_status text,
  p_status_note text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_previous_status text;
BEGIN
  IF v_actor IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admin access required.' USING errcode = '42501';
  END IF;
  IF p_id IS NULL OR p_status IS NULL OR p_status NOT IN ('open', 'in_progress', 'blocked', 'done', 'dismissed')
    OR p_status_note IS NULL OR length(p_status_note) > 500
    OR (p_status = 'blocked' AND length(trim(p_status_note)) = 0) THEN
    RAISE EXCEPTION 'Invalid research backlog status update.' USING errcode = '22023';
  END IF;

  SELECT status INTO v_previous_status
    FROM public.ai_research_backlog WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Research backlog item not found.' USING errcode = 'P0002';
  END IF;
  IF v_previous_status = p_status THEN
    RAISE EXCEPTION 'Research backlog item already has that status.' USING errcode = '22023';
  END IF;

  UPDATE public.ai_research_backlog SET status = p_status, status_note = trim(p_status_note), updated_at = now() WHERE id = p_id;
  INSERT INTO public.admin_audit_events(actor_id, action, details)
    VALUES (v_actor, 'ai_research_backlog_status_changed', jsonb_build_object(
      'backlog_id', p_id, 'previous_status', v_previous_status, 'status', p_status, 'status_note', trim(p_status_note)
    ));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_ai_research_backlog(text, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_ai_research_backlog(text, text, text, text, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_update_ai_research_backlog_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_ai_research_backlog_status(uuid, text, text) TO authenticated;

COMMENT ON TABLE public.ai_research_backlog IS 'Admin-curated evidence-linked research questions; status changes and creation are audited.';
