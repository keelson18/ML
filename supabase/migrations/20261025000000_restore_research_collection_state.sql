-- Forward repair for deployments where collection candles exist but their state table does not.
CREATE TABLE IF NOT EXISTS public.research_collection_state (
  experiment_id uuid PRIMARY KEY REFERENCES public.research_experiments(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  symbol text NOT NULL,
  provider text NOT NULL,
  continuous boolean NOT NULL,
  test_start_time bigint NOT NULL,
  initialized_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.research_collection_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_collection_state FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.research_collection_state TO service_role;
