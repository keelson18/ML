CREATE TABLE IF NOT EXISTS public.paper_sim_accounts (
  account_id text PRIMARY KEY,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.paper_sim_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.paper_sim_accounts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.touch_paper_sim_account_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS paper_sim_accounts_updated_at ON public.paper_sim_accounts;
CREATE TRIGGER paper_sim_accounts_updated_at
  BEFORE UPDATE ON public.paper_sim_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_paper_sim_account_updated_at();
