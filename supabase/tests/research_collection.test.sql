begin;
select plan(16);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('e0f36c22-1ae9-48d1-8ae7-3bf8f9be8001', 'authenticated', 'authenticated', 'research-collection-test@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;

select set_config('request.jwt.claim.role', 'service_role', true);
select has_table('public', 'research_collection_candles', 'forward research candles have a dedicated durable table');
select has_table('public', 'research_collection_state', 'collection identity is fixed independently of client requests');
select ok(to_regprocedure('public.append_research_collection_batch(uuid,uuid,text,boolean,jsonb)') is not null,
  'candle batches are written through the service-only RPC');
select ok(not has_table_privilege('authenticated', 'public.research_collection_candles', 'SELECT'),
  'authenticated clients cannot read collection internals directly');
select ok(not has_table_privilege('authenticated', 'public.research_collection_candles', 'INSERT'),
  'authenticated clients cannot author provider candles');
select ok(not has_function_privilege('authenticated', 'public.append_research_collection_batch(uuid,uuid,text,boolean,jsonb)', 'EXECUTE'),
  'authenticated clients cannot call the collection write RPC');
select ok(has_table_privilege('service_role', 'public.research_collection_state', 'SELECT'),
  'service-role collection reads are allowed');
select ok(not has_table_privilege('authenticated', 'public.research_collection_state', 'SELECT'),
  'authenticated clients cannot inspect collection state');
select ok(not has_table_privilege('service_role', 'public.research_collection_state', 'INSERT,UPDATE,DELETE'),
  'service role cannot bypass the transactional collection RPC with direct writes');
select ok(has_function_privilege('service_role', 'public.append_research_collection_batch(uuid,uuid,text,boolean,jsonb)', 'EXECUTE'),
  'service role can append collection state through the restricted RPC');
select ok((select prosecdef from pg_proc where oid = 'public.append_research_collection_batch(uuid,uuid,text,boolean,jsonb)'::regprocedure),
  'collection RPC is security definer so its transaction can write revoked table state');
select ok(exists (select 1 from pg_trigger where tgname = 'research_collection_candles_immutable' and not tgisinternal),
  'stored forward candles cannot be edited or deleted');
select ok(exists (select 1 from pg_trigger where tgname = 'research_collection_candles_no_truncate' and not tgisinternal),
  'stored forward candles cannot be truncated');

do $$
declare
  v_series jsonb;
  v_result jsonb;
  v_start bigint := floor(extract(epoch from now()) / 900)::bigint * 900 + 3600;
begin
  insert into public.research_experiments (id, user_id, name, hypothesis, dataset_id, parameters)
  values ('e0f36c22-1ae9-48d1-8ae7-3bf8f9be8002', 'e0f36c22-1ae9-48d1-8ae7-3bf8f9be8001',
    'collection-append', 'fixed future holdout', 'provider', jsonb_build_object('testStartTime', v_start));

  select jsonb_agg(jsonb_build_object(
    'timeframe', sample.timeframe, 'provider', 'fixture-provider', 'dataVersion', sample.timeframe || '-v1',
    'fetchedAt', extract(epoch from now()) * 1000,
    'candles', (select jsonb_agg(jsonb_build_object('time', sample.end_time - sample.step * (sample.count - n + 1),
      'open', 100, 'high', 101, 'low', 99, 'close', 100.5, 'volume', 1) order by n)
      from generate_series(1, sample.count) n)
  )) into v_series
  from (
    select timeframe, step, count,
      floor(extract(epoch from now()) / step)::bigint * step - step * 2 as end_time
    from (values ('15m', 900::bigint, 200), ('1h', 3600::bigint, 50), ('4h', 14400::bigint, 50), ('1d', 86400::bigint, 50)) v(timeframe, step, count)
  ) sample;

  v_result := public.append_research_collection_batch('e0f36c22-1ae9-48d1-8ae7-3bf8f9be8002',
    'e0f36c22-1ae9-48d1-8ae7-3bf8f9be8001', 'BTCUSD', true, v_series);
  perform set_config('test.collection_first_new', (v_result->>'newCandles'), true);
  v_result := public.append_research_collection_batch('e0f36c22-1ae9-48d1-8ae7-3bf8f9be8002',
    'e0f36c22-1ae9-48d1-8ae7-3bf8f9be8001', 'BTCUSD', true, v_series);
  perform set_config('test.collection_retry_new', (v_result->>'newCandles'), true);
end;
$$;

select is(current_setting('test.collection_first_new'), '350', 'initial bootstrap stores bounded closed candles for all four timeframes');
select is(current_setting('test.collection_retry_new'), '0', 'identical collection retries do not duplicate candle rows');
select is((select count(*)::integer from public.research_collection_candles where experiment_id = 'e0f36c22-1ae9-48d1-8ae7-3bf8f9be8002'),
  350, 'the append-only collection contains each baseline candle exactly once');

select * from finish();
rollback;
