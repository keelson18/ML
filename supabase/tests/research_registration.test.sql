begin;
select plan(6);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('e0f36c22-1ae9-48d1-8ae7-3bf8f9be8001', 'authenticated', 'authenticated', 'research-registration-test@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;

select throws_ok($$
  insert into public.research_experiments (id, user_id, name, hypothesis, dataset_id, parameters)
  values ('e0f36c22-1ae9-48d1-8ae7-3bf8f9be8002', 'e0f36c22-1ae9-48d1-8ae7-3bf8f9be8001', 'historical-boundary', 'must fail', 'fixture',
    jsonb_build_object('testStartTime', 1))
$$, '22023', 'research testStartTime must follow experiment registration',
  'database rejects a historical test boundary');

insert into public.research_experiments (id, user_id, name, hypothesis, dataset_id, parameters)
values ('e0f36c22-1ae9-48d1-8ae7-3bf8f9be8003', 'e0f36c22-1ae9-48d1-8ae7-3bf8f9be8001', 'future-boundary', 'must succeed', 'fixture',
  jsonb_build_object('testStartTime', floor(extract(epoch from now()) + 3600)));

select throws_ok($$
  update public.research_experiments set created_at = now() - interval '2 days'
  where id = 'e0f36c22-1ae9-48d1-8ae7-3bf8f9be8003'
$$, '55000', 'research experiment registration time is immutable',
  'database prevents rewriting the registration date');

select throws_ok($$
  update public.research_experiments set parameters = jsonb_set(parameters, '{testStartTime}', '1')
  where id = 'e0f36c22-1ae9-48d1-8ae7-3bf8f9be8003'
$$, '55000', 'research experiment parameters are immutable after registration',
  'database prevents changing the strategy or registered holdout');

insert into public.research_experiments (id, user_id, name, hypothesis, dataset_id, parameters)
values ('e0f36c22-1ae9-48d1-8ae7-3bf8f9be8004', 'e0f36c22-1ae9-48d1-8ae7-3bf8f9be8001', 'overlap-a', 'must not overlap', 'fixture',
  jsonb_build_object('testStartTime', floor(extract(epoch from now()) + 3600))),
       ('e0f36c22-1ae9-48d1-8ae7-3bf8f9be8005', 'e0f36c22-1ae9-48d1-8ae7-3bf8f9be8001', 'overlap-b', 'must not overlap', 'fixture',
  jsonb_build_object('testStartTime', floor(extract(epoch from now()) + 3600)));

select lives_ok($$
  insert into public.research_holdout_claims (experiment_id, symbol, timeframe, dataset_id, test_start_time, test_end_time)
  values ('e0f36c22-1ae9-48d1-8ae7-3bf8f9be8004', 'BTCUSD', '1d', 'fixture',
    floor(extract(epoch from now()) + 7200)::bigint, floor(extract(epoch from now()) + 17200)::bigint)
$$, 'first interval can be claimed');

select throws_ok($$
  insert into public.research_holdout_claims (experiment_id, symbol, timeframe, dataset_id, test_start_time, test_end_time)
  values ('e0f36c22-1ae9-48d1-8ae7-3bf8f9be8005', 'BTCUSD', '1d', 'other-dataset',
    floor(extract(epoch from now()) + 10000)::bigint, floor(extract(epoch from now()) + 20000)::bigint)
$$, '23P01', 'research holdout overlaps a previously claimed interval for BTCUSD 1d',
  'database rejects overlapping windows even when dataset ids differ');

select lives_ok($$
  insert into public.research_holdout_claims (experiment_id, symbol, timeframe, dataset_id, test_start_time, test_end_time)
  values ('e0f36c22-1ae9-48d1-8ae7-3bf8f9be8005', 'BTCUSD', '1d', 'fixture',
    floor(extract(epoch from now()) + 17200)::bigint, floor(extract(epoch from now()) + 27200)::bigint)
$$, 'adjacent half-open windows are allowed');

select * from finish();
rollback;
