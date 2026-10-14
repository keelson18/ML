begin;
select plan(4);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('d47b5be5-ec9e-483a-a6f3-22161af47c11', 'authenticated', 'authenticated', 'paper-management-open@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('d47b5be5-ec9e-483a-a6f3-22161af47c12', 'authenticated', 'authenticated', 'paper-management-idle@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('d47b5be5-ec9e-483a-a6f3-22161af47c13', 'authenticated', 'authenticated', 'paper-management-enabled@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;

insert into public.paper_autopilot (account_id, enabled, symbols)
values
  ('d47b5be5-ec9e-483a-a6f3-22161af47c11', false, array['BTCUSD']),
  ('d47b5be5-ec9e-483a-a6f3-22161af47c12', false, array['BTCUSD']),
  ('d47b5be5-ec9e-483a-a6f3-22161af47c13', true, array['BTCUSD']);

insert into public.paper_sim_accounts (account_id, state)
values
  ('d47b5be5-ec9e-483a-a6f3-22161af47c11', '{"cash":1000,"positions":[{"id":"open-position","status":"open"}],"trades":[]}'::jsonb),
  ('d47b5be5-ec9e-483a-a6f3-22161af47c12', '{"cash":1000,"positions":[],"trades":[]}'::jsonb);

select ok(exists (select 1 from public.list_enabled_paper_autopilots() where account_id = 'd47b5be5-ec9e-483a-a6f3-22161af47c11'), 'disabled account with an open position remains available for management');
select ok(not exists (select 1 from public.list_enabled_paper_autopilots() where account_id = 'd47b5be5-ec9e-483a-a6f3-22161af47c12'), 'disabled account without an open position is not scheduled');
select ok(exists (select 1 from public.list_enabled_paper_autopilots() where account_id = 'd47b5be5-ec9e-483a-a6f3-22161af47c13'), 'enabled account remains scheduled');
select ok(not has_function_privilege('authenticated', 'public.list_enabled_paper_autopilots()', 'EXECUTE'), 'only the backend service role can list managed paper accounts');

select * from finish();
rollback;
