CREATE TABLE IF NOT EXISTS public.coach_daily_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  tokens_reserved integer NOT NULL DEFAULT 0 CHECK (tokens_reserved >= 0),
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE public.coach_daily_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_daily_usage FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_coach_budget(p_user_id uuid, p_tokens integer, p_daily_cap integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'UTC')::date;
  reserved integer;
BEGIN
  IF p_user_id IS NULL OR p_tokens < 1 OR p_daily_cap < 1 THEN
    RETURN false;
  END IF;

  INSERT INTO public.coach_daily_usage(user_id, usage_date, tokens_reserved)
  VALUES (p_user_id, today, 0)
  ON CONFLICT (user_id, usage_date) DO NOTHING;

  SELECT tokens_reserved INTO reserved
  FROM public.coach_daily_usage
  WHERE user_id = p_user_id AND usage_date = today
  FOR UPDATE;

  IF reserved + p_tokens > p_daily_cap THEN
    RETURN false;
  END IF;

  UPDATE public.coach_daily_usage
  SET tokens_reserved = tokens_reserved + p_tokens
  WHERE user_id = p_user_id AND usage_date = today;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_coach_budget(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_coach_budget(uuid, integer, integer) TO service_role;
