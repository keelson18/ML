-- Controlled learning and research workflow records.

CREATE TABLE IF NOT EXISTS learning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK (source_type IN ('paper_trade', 'research', 'risk_event', 'data_quality')),
  source_id uuid,
  observation jsonb NOT NULL DEFAULT '{}'::jsonb,
  hypothesis text NOT NULL,
  status text NOT NULL DEFAULT 'observation' CHECK (status IN ('observation', 'hypothesis', 'validated', 'candidate', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS learning_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_event_id uuid NOT NULL REFERENCES learning_events(id) ON DELETE RESTRICT,
  dataset_id text NOT NULL,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'completed', 'rejected')),
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS learning_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_experiment_id uuid NOT NULL REFERENCES learning_experiments(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('accepted', 'rejected')),
  conclusion text NOT NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  name text NOT NULL,
  hypothesis text NOT NULL,
  dataset_id text NOT NULL,
  strategy_version_id uuid REFERENCES strategy_versions(id) ON DELETE RESTRICT,
  model_version_id uuid REFERENCES model_versions(id) ON DELETE RESTRICT,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'completed', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES research_experiments(id) ON DELETE RESTRICT,
  run_version text NOT NULL,
  seed bigint,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (experiment_id, run_version)
);

CREATE TABLE IF NOT EXISTS research_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES research_runs(id) ON DELETE RESTRICT,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  artifacts jsonb NOT NULL DEFAULT '{}'::jsonb,
  conclusion text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL REFERENCES research_experiments(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learning_events_user_created ON learning_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_experiments_event ON learning_experiments(learning_event_id);
CREATE INDEX IF NOT EXISTS idx_research_experiments_user_created ON research_experiments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_runs_experiment ON research_runs(experiment_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_results_run ON research_results(run_id);

ALTER TABLE learning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_learning_events" ON learning_events FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "users_read_own_learning_experiments" ON learning_experiments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM learning_events e WHERE e.id = learning_event_id AND e.user_id = auth.uid()));
CREATE POLICY "users_create_learning_experiments" ON learning_experiments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM learning_events e WHERE e.id = learning_event_id AND e.user_id = auth.uid()));
CREATE POLICY "users_read_own_learning_outcomes" ON learning_outcomes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM learning_experiments x
    JOIN learning_events e ON e.id = x.learning_event_id
    WHERE x.id = learning_experiment_id AND e.user_id = auth.uid()
  ));
CREATE POLICY "users_manage_own_research_experiments" ON research_experiments FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND status <> 'approved');
CREATE POLICY "users_read_own_research_runs" ON research_runs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM research_experiments e WHERE e.id = experiment_id AND e.user_id = auth.uid()));
CREATE POLICY "users_create_research_runs" ON research_runs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM research_experiments e WHERE e.id = experiment_id AND e.user_id = auth.uid()));
CREATE POLICY "users_read_own_research_results" ON research_results FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM research_runs r
    JOIN research_experiments e ON e.id = r.experiment_id
    WHERE r.id = run_id AND e.user_id = auth.uid()
  ));
CREATE POLICY "users_create_research_results" ON research_results FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM research_runs r
    JOIN research_experiments e ON e.id = r.experiment_id
    WHERE r.id = run_id AND e.user_id = auth.uid()
  ));
CREATE POLICY "users_read_own_research_approvals" ON research_approvals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM research_experiments e WHERE e.id = experiment_id AND e.user_id = auth.uid()));