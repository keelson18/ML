ALTER TABLE public.paper_sim_accounts
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0;
