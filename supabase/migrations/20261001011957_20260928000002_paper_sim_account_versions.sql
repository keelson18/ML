/*
# Paper Sim Account Versions

1. Modified Tables
- `paper_sim_accounts` — adds `version` column (bigint, not null, default 0) for optimistic concurrency control.
2. Notes
- This column enables optimistic locking on paper sim account state updates to prevent lost updates when multiple requests modify the same account concurrently.
*/

ALTER TABLE public.paper_sim_accounts
  ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0;
