begin;
select plan(8);

select ok(to_regclass('public.ml_model_artifacts') is not null, 'model artifact table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.ml_model_artifacts'::regclass), 'model artifacts have RLS enabled');
select ok(not has_table_privilege('anon', 'public.ml_model_artifacts', 'SELECT'), 'anonymous users cannot read model weights');
select ok(not has_table_privilege('authenticated', 'public.ml_model_artifacts', 'SELECT'), 'authenticated users cannot read model weights directly');
select ok(has_table_privilege('service_role', 'public.ml_model_artifacts', 'SELECT,INSERT'), 'service role can load and persist model artifacts');
select ok(not has_table_privilege('authenticated', 'public.ml_model_artifacts', 'UPDATE,DELETE'), 'authenticated users cannot mutate model artifacts');

insert into public.ml_model_artifacts (
  symbol, timeframe, version, algorithm, feature_schema_version, prediction_horizon, minimum_move_atr,
  training_parameters, dataset_id, provider, source_instrument, quote_currency,
  weights, bias, feature_mean, feature_std, training_metrics, test_metrics,
  momentum_baseline_accuracy, no_edge, return_calibration, data_start, data_end
) values (
  'BTCUSD', '1h', 'test-artifact-' || txid_current(), 'logistic-regression', 'ohlcv-v1', 5, 0.1,
  '{"epochs":200,"learningRate":0.1}'::jsonb, 'test-dataset', 'twelvedata', 'BTC/USD', 'USD',
  '[0.1]'::jsonb, 0, '[0]'::jsonb, '[1]'::jsonb, '{"accuracy":0.5}'::jsonb, '{"accuracy":0.5}'::jsonb,
  0.5, true, '[]'::jsonb, 100, 200
);

select throws_ok(
  $$update public.ml_model_artifacts set bias = 1 where symbol = 'BTCUSD' and version = 'test-artifact-' || txid_current()$$,
  'P0001', 'ML model artifacts are append-only', 'model artifact updates are rejected'
);
select throws_ok(
  $$delete from public.ml_model_artifacts where symbol = 'BTCUSD' and version = 'test-artifact-' || txid_current()$$,
  'P0001', 'ML model artifacts are append-only', 'model artifact deletes are rejected'
);

select * from finish();
rollback;
