CREATE TABLE IF NOT EXISTS public.ml_model_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL CHECK (symbol ~ '^[A-Z0-9]{2,20}$'),
  timeframe text NOT NULL CHECK (timeframe IN ('1m','3m','5m','15m','30m','1h','4h','1d','1w','1M')),
  version text NOT NULL,
  algorithm text NOT NULL,
  feature_schema_version text NOT NULL,
  prediction_horizon integer NOT NULL CHECK (prediction_horizon > 0),
  minimum_move_atr numeric NOT NULL CHECK (minimum_move_atr >= 0),
  training_parameters jsonb NOT NULL CHECK (jsonb_typeof(training_parameters) = 'object'),
  dataset_id text NOT NULL,
  provider text NOT NULL,
  source_instrument text NOT NULL,
  quote_currency text NOT NULL,
  weights jsonb NOT NULL CHECK (jsonb_typeof(weights) = 'array'),
  bias double precision NOT NULL,
  feature_mean jsonb NOT NULL CHECK (jsonb_typeof(feature_mean) = 'array'),
  feature_std jsonb NOT NULL CHECK (jsonb_typeof(feature_std) = 'array'),
  training_metrics jsonb NOT NULL CHECK (jsonb_typeof(training_metrics) = 'object'),
  test_metrics jsonb NOT NULL CHECK (jsonb_typeof(test_metrics) = 'object'),
  momentum_baseline_accuracy numeric NOT NULL CHECK (momentum_baseline_accuracy BETWEEN 0 AND 1),
  no_edge boolean NOT NULL,
  return_calibration jsonb NOT NULL CHECK (jsonb_typeof(return_calibration) = 'array'),
  data_start bigint NOT NULL,
  data_end bigint NOT NULL CHECK (data_end >= data_start),
  trained_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol, timeframe, version)
);

ALTER TABLE public.ml_predictions ALTER COLUMN expected_move_pct DROP NOT NULL;

ALTER TABLE public.ml_model_artifacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ml_model_artifacts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.ml_model_artifacts TO service_role;

CREATE OR REPLACE FUNCTION public.reject_ml_model_artifact_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'ML model artifacts are append-only';
END;
$$;

CREATE TRIGGER ml_model_artifacts_no_update_delete
  BEFORE UPDATE OR DELETE ON public.ml_model_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.reject_ml_model_artifact_mutation();

CREATE TRIGGER ml_model_artifacts_no_truncate
  BEFORE TRUNCATE ON public.ml_model_artifacts
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_ml_model_artifact_mutation();

COMMENT ON TABLE public.ml_model_artifacts IS
  'Immutable service-written model weights, chronological evaluation metrics, label policy, and validation-period return calibration.';
