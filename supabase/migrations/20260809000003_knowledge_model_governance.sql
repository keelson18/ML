-- Knowledge and model governance primitives.
-- User writes are restricted to non-production states; promotion is server-controlled.

CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type text NOT NULL CHECK (node_type IN ('pattern', 'strategy', 'regime', 'asset', 'lesson', 'hypothesis', 'market_behavior')),
  title text NOT NULL,
  content text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  confidence numeric NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'validated', 'approved', 'retired')),
  version text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (title, version)
);

CREATE TABLE IF NOT EXISTS knowledge_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_node_id uuid NOT NULL REFERENCES knowledge_nodes(id) ON DELETE RESTRICT,
  target_node_id uuid NOT NULL REFERENCES knowledge_nodes(id) ON DELETE RESTRICT,
  relation_type text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_node_id, target_node_id, relation_type)
);

CREATE TABLE IF NOT EXISTS knowledge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL REFERENCES knowledge_nodes(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('created', 'validated', 'approved', 'revised', 'retired')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES models(id) ON DELETE RESTRICT,
  version text NOT NULL,
  artifact_reference text,
  training_dataset text NOT NULL,
  feature_set text NOT NULL,
  algorithm text NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'research' CHECK (status IN ('research', 'candidate', 'paper', 'approved', 'retired', 'rollback')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_id, version)
);

CREATE TABLE IF NOT EXISTS model_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version_id uuid NOT NULL REFERENCES model_versions(id) ON DELETE RESTRICT,
  dataset_id text NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluation_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version_id uuid NOT NULL REFERENCES model_versions(id) ON DELETE RESTRICT,
  environment text NOT NULL,
  status text NOT NULL CHECK (status IN ('research', 'paper', 'approved', 'retired', 'rollback')),
  deployed_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_knowledge_tags ON knowledge_nodes USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_relationship_source ON knowledge_relationships(source_node_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_relationship_target ON knowledge_relationships(target_node_id);
CREATE INDEX IF NOT EXISTS idx_model_versions_status ON model_versions(status);
CREATE INDEX IF NOT EXISTS idx_model_deployments_version ON model_deployments(model_version_id);

ALTER TABLE knowledge_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE models ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_approved_knowledge" ON knowledge_nodes FOR SELECT TO authenticated
  USING (status IN ('validated', 'approved') OR created_by = auth.uid());
CREATE POLICY "users_create_draft_knowledge" ON knowledge_nodes FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND status = 'draft');
CREATE POLICY "read_knowledge_relationships" ON knowledge_relationships FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM knowledge_nodes n WHERE n.id = source_node_id AND (n.status IN ('validated', 'approved') OR n.created_by = auth.uid())));
CREATE POLICY "users_create_knowledge_relationships" ON knowledge_relationships FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "read_knowledge_events" ON knowledge_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM knowledge_nodes n WHERE n.id = node_id AND (n.status IN ('validated', 'approved') OR n.created_by = auth.uid())));
CREATE POLICY "read_models" ON models FOR SELECT TO authenticated USING (true);
CREATE POLICY "users_create_models" ON models FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "read_model_versions" ON model_versions FOR SELECT TO authenticated
  USING (status IN ('candidate', 'paper', 'approved', 'retired', 'rollback') OR created_by = auth.uid());
CREATE POLICY "users_create_research_models" ON model_versions FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND status = 'research');
CREATE POLICY "read_model_evaluations" ON model_evaluations FOR SELECT TO authenticated USING (true);
CREATE POLICY "users_create_model_evaluations" ON model_evaluations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "read_model_deployments" ON model_deployments FOR SELECT TO authenticated USING (true);