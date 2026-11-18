BEGIN;
SELECT plan(15);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
VALUES
  ('4d9ff29b-954b-4e15-b793-c18daf048301', 'authenticated', 'authenticated', 'research-backlog-admin@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('4d9ff29b-954b-4e15-b793-c18daf048302', 'authenticated', 'authenticated', 'research-backlog-user@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, role) VALUES ('4d9ff29b-954b-4e15-b793-c18daf048301', 'admin')
ON CONFLICT (id) DO UPDATE SET role = excluded.role;
INSERT INTO public.system_events(id, event_type, severity)
VALUES ('4d9ff29b-954b-4e15-b793-c18daf048399', 'data_quality', 'warning');

SELECT has_table('public', 'ai_research_backlog', 'the evidence-linked research backlog table exists');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ai_research_backlog'::regclass), 'row-level security is enabled');
SELECT ok(has_table_privilege('authenticated', 'public.ai_research_backlog', 'SELECT'), 'authenticated readers are gated by the admin RLS policy');
SELECT ok(has_table_privilege('service_role', 'public.ai_research_backlog', 'SELECT'), 'the authenticated backend can read records through its service-role client');
SELECT ok(NOT has_table_privilege('authenticated', 'public.ai_research_backlog', 'INSERT,UPDATE,DELETE'), 'authenticated clients cannot directly mutate backlog records');
SELECT ok(NOT has_table_privilege('service_role', 'public.ai_research_backlog', 'INSERT,UPDATE,DELETE'), 'service role also uses audited mutation functions');
SELECT ok(has_function_privilege('authenticated', 'public.admin_create_ai_research_backlog(text,text,text,text,jsonb)', 'EXECUTE'), 'authenticated sessions can call the admin-checked create function');
SELECT ok(NOT has_function_privilege('anon', 'public.admin_create_ai_research_backlog(text,text,text,text,jsonb)', 'EXECUTE'), 'anonymous sessions cannot create backlog records');
SELECT ok(has_function_privilege('authenticated', 'public.admin_update_ai_research_backlog_status(uuid,text,text)', 'EXECUTE'), 'authenticated sessions can call the admin-checked status function');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"4d9ff29b-954b-4e15-b793-c18daf048302","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT public.admin_create_ai_research_backlog('Unauthorized', 'Can a user write?', '', 'low', '[{"source_type":"data_quality","source_id":"4d9ff29b-954b-4e15-b793-c18daf048399","description":"Existing system event"}]'::jsonb)$$,
  '42501', 'Admin access required.', 'non-admin users cannot create backlog records'
);
SELECT set_config('request.jwt.claims', '{"sub":"4d9ff29b-954b-4e15-b793-c18daf048301","role":"authenticated"}', true);
SELECT throws_ok(
  $$SELECT public.admin_create_ai_research_backlog('Missing evidence', 'Can this be verified?', '', 'medium', '[{"source_type":"data_quality","source_id":"4d9ff29b-954b-4e15-b793-c18daf048398","description":"A nonexistent system event"}]'::jsonb)$$,
  '22023', 'Research evidence source does not exist.', 'the create function rejects evidence IDs that do not resolve to a source record'
);
SELECT lives_ok(
  $$SELECT public.admin_create_ai_research_backlog('Review source integrity', 'Does this event change the validation decision?', 'A provider quality warning needs review.', 'high', '[{"source_type":"data_quality","source_id":"4d9ff29b-954b-4e15-b793-c18daf048399","description":"Existing system event"}]'::jsonb)$$,
  'an administrator can create a question linked to an existing evidence row'
);
SELECT lives_ok(
  $$SELECT public.admin_update_ai_research_backlog_status((SELECT id FROM public.ai_research_backlog WHERE title = 'Review source integrity'), 'blocked', 'Waiting for a fresh provider sample.')$$,
  'an administrator can record a blocked state with its reason'
);
SELECT is((SELECT status || ':' || status_note FROM public.ai_research_backlog WHERE title = 'Review source integrity'), 'blocked:Waiting for a fresh provider sample.', 'status and status reason persist together');
SELECT is((SELECT count(*)::integer FROM public.admin_audit_events WHERE actor_id = '4d9ff29b-954b-4e15-b793-c18daf048301' AND action IN ('ai_research_backlog_created', 'ai_research_backlog_status_changed')), 2, 'creation and status changes both write audit rows');

SELECT * FROM finish();
ROLLBACK;
