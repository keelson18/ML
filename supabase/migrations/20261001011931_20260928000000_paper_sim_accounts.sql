/*
# Paper Sim Accounts

1. New Tables
- `paper_sim_accounts` — stores paper trading simulation account state as JSONB.
  - `account_id` (text, primary key)
  - `state` (jsonb, not null) — serialized account state
  - `updated_at` (timestamptz with time zone, auto-updated via trigger)
2. New Functions
- `touch_paper_sim_account_updated_at()` — trigger function to set updated_at on update.
3. New Triggers
- `paper_sim_accounts_updated_at` — fires BEFORE UPDATE to set updated_at.
4. Security
- RLS enabled.
- ALL access revoked from anon and authenticated (service-role only).
*/

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
SECURITY DEFINER
SET search_path = public
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
