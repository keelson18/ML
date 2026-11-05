begin;
select plan(8);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('e0f36c22-1ae9-48d1-8ae7-3bf8f9be8010', 'authenticated', 'authenticated', 'market-admin@example.invalid', '', now(),
  '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;
insert into public.profiles (id, role) values ('e0f36c22-1ae9-48d1-8ae7-3bf8f9be8010', 'admin')
on conflict (id) do update set role = excluded.role;

select ok(not has_table_privilege('authenticated', 'public.market_access_restrictions', 'SELECT'),
  'authenticated users cannot read raw access restrictions');
select ok(has_table_privilege('service_role', 'public.market_access_restrictions', 'SELECT'),
  'backend service can read access restrictions');
select ok(has_function_privilege('authenticated', 'public.admin_set_market_access_restriction(text,boolean,text)', 'EXECUTE'),
  'authenticated sessions reach the guarded restriction function');

select set_config('request.jwt.claims', '{"sub":"e0f36c22-1ae9-48d1-8ae7-3bf8f9be8010","role":"authenticated","aal":"aal1"}', true);
select throws_ok($$select public.admin_set_market_access_restriction('XRPUSD', true, 'operator restriction')$$,
  '42501', 'Administrator MFA required.', 'restriction changes require administrator MFA');
select set_config('request.jwt.claims', '{"sub":"e0f36c22-1ae9-48d1-8ae7-3bf8f9be8010","role":"authenticated","aal":"aal2"}', true);
select lives_ok($$select public.admin_set_market_access_restriction('XRPUSD', true, 'operator restriction')$$,
  'MFA administrator can restrict an active instrument');
select ok((select blocked from public.market_access_restrictions where symbol = 'XRPUSD'),
  'restriction is persisted');
select is((select count(*)::integer from public.admin_audit_events where actor_id = 'e0f36c22-1ae9-48d1-8ae7-3bf8f9be8010' and action = 'market.access_restriction.updated'),
  1, 'restriction changes are audited');
select lives_ok($$select public.admin_set_market_access_restriction('XRPUSD', false, 'restored')$$,
  'MFA administrator can restore an instrument');

select * from finish();
rollback;
