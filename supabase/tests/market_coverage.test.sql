-- Covers admin tier governance and the database-side paper-autopilot tier guard.
begin;
select plan(9);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('e0f36c22-1ae9-48d1-8ae7-3bf8f9be8010', 'authenticated', 'authenticated', 'coverage-admin@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}', '{}'),
  ('e0f36c22-1ae9-48d1-8ae7-3bf8f9be8011', 'authenticated', 'authenticated', 'coverage-user@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;
insert into public.profiles (id, role) values
  ('e0f36c22-1ae9-48d1-8ae7-3bf8f9be8010', 'admin'),
  ('e0f36c22-1ae9-48d1-8ae7-3bf8f9be8011', 'user')
on conflict (id) do update set role = excluded.role;

select ok(not has_table_privilege('authenticated', 'public.market_coverage_overrides', 'SELECT'),
  'authenticated users cannot read raw coverage overrides');
select ok(has_table_privilege('service_role', 'public.market_coverage_overrides', 'SELECT'),
  'backend service can read coverage overrides');
select ok(has_function_privilege('authenticated', 'public.admin_set_market_coverage_tier(text,text,text,boolean,boolean,boolean)', 'EXECUTE'),
  'authenticated sessions reach the guarded tier function');

update public.autopilot_settings set max_symbols_global = 4 where singleton;
select set_config('request.jwt.claims', '{"sub":"e0f36c22-1ae9-48d1-8ae7-3bf8f9be8010","role":"authenticated","aal":"aal1"}', true);
select throws_ok($$select public.admin_set_market_coverage_tier('XRPUSD', 'C', 'verified mapping', true, true, true)$$,
  '42501', 'Administrator MFA required.', 'tier assignments require administrator MFA');
select set_config('request.jwt.claims', '{"sub":"e0f36c22-1ae9-48d1-8ae7-3bf8f9be8010","role":"authenticated","aal":"aal2"}', true);
select lives_ok($$select public.admin_set_market_coverage_tier('XRPUSD', 'A', 'verified crypto mapping', true, true, true)$$,
  'MFA administrator can assign an available mapped crypto symbol within the dynamic cap');
select throws_ok($$select public.admin_set_market_coverage_tier('BNBUSD', 'A', 'verified crypto mapping', true, true, true)$$,
  '23514', 'Tier A global cap reached.', 'Tier A assignment cannot exceed the database global cap');
select is((select count(*)::integer from public.admin_audit_events where actor_id = 'e0f36c22-1ae9-48d1-8ae7-3bf8f9be8010' and action = 'market.coverage.updated'),
  1, 'successful tier edits are written to the admin audit log');
select throws_ok($$insert into public.paper_autopilot(account_id, enabled, symbols)
  values ('e0f36c22-1ae9-48d1-8ae7-3bf8f9be8011', true, array['XAUUSD'])$$,
  '23514', 'Only Tier A instruments may enter paper autopilot.', 'blocked non-crypto symbol cannot be enrolled');
select throws_ok($$select public.admin_set_market_coverage_tier('XAUUSD', 'C', 'unverified mapping', false, false, false)$$,
  '23514', 'Provider mapping must be verified before assignment.', 'on-demand tier requires an explicitly verified provider mapping');

select * from finish();
rollback;
