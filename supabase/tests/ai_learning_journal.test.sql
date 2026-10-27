begin;
select plan(10);

select has_table('public', 'ai_learning_journal', 'AI Learning has a dedicated durable journal');
select ok(has_table_privilege('authenticated', 'public.ai_learning_journal', 'SELECT'),
  'authenticated read access is constrained by row-level security');
select ok(not has_table_privilege('authenticated', 'public.ai_learning_journal', 'INSERT,UPDATE,DELETE'),
  'authenticated clients cannot mutate journal history');
select ok(not has_table_privilege('service_role', 'public.ai_learning_journal', 'INSERT,UPDATE,DELETE'),
  'service role writes only through the append function');
select ok(has_function_privilege('service_role', 'public.append_ai_learning_journal_event(jsonb)', 'EXECUTE'),
  'service role can append events through the controlled function');
select ok(not has_function_privilege('authenticated', 'public.append_ai_learning_journal_event(jsonb)', 'EXECUTE'),
  'authenticated users cannot impersonate system event writers');
select ok((select prosecdef from pg_proc where oid = 'public.append_ai_learning_journal_event(jsonb)'::regprocedure),
  'journal append is a security-definer transaction');
select ok((select relrowsecurity from pg_class where oid = 'public.ai_learning_journal'::regclass),
  'row-level security is enabled');

select set_config('request.jwt.claim.role', 'service_role', true);
select is(
  public.append_ai_learning_journal_event('{"event_key":"test:journal-idempotency","event_type":"trade_analysis_completed","title":"Analysis completed","detail":"Persisted test evidence.","source_service":"pgTAP","related_records":{},"evidence":{}}'::jsonb),
  public.append_ai_learning_journal_event('{"event_key":"test:journal-idempotency","event_type":"trade_analysis_completed","title":"Analysis completed","detail":"Persisted test evidence.","source_service":"pgTAP","related_records":{},"evidence":{}}'::jsonb),
  'retries with the same event key return the original record');
select is((select count(*)::integer from public.ai_learning_journal where event_key = 'test:journal-idempotency'),
  1, 'idempotent retries preserve one append-only journal row');

select * from finish();
rollback;
