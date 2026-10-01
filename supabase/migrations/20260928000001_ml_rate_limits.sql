CREATE TABLE IF NOT EXISTS public.ml_rate_limit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rate_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ml_rate_limit_events_key_time
  ON public.ml_rate_limit_events(rate_key, created_at DESC);

ALTER TABLE public.ml_rate_limit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ml_rate_limit_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_ml_rate_limit(p_key text, p_max_requests integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_count integer;
BEGIN
  IF p_key IS NULL OR length(p_key) = 0 OR p_max_requests < 1 THEN
    RETURN false;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_key));
  DELETE FROM public.ml_rate_limit_events WHERE created_at < now() - interval '2 minutes';

  SELECT count(*) INTO request_count
  FROM public.ml_rate_limit_events
  WHERE rate_key = p_key AND created_at >= now() - interval '1 minute';

  IF request_count >= p_max_requests THEN
    RETURN false;
  END IF;

  INSERT INTO public.ml_rate_limit_events(rate_key) VALUES (p_key);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ml_rate_limit(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ml_rate_limit(text, integer) TO service_role;
