ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS chart_layers jsonb NOT NULL
  DEFAULT '{"structure":true,"zones":true,"tradeLevels":true,"signals":true,"trades":true}'::jsonb;
