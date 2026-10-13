begin;
select plan(12);

select has_table('public', 'research_holdout_claims', 'holdout claims prevent repeated tuning on the same chronological test period');
select has_table('public', 'research_approvals', 'administrator approval decisions are persisted for audit');
select has_table('public', 'strategy_promotions', 'active strategies retain a database reference to their validated run');
select ok(to_regprocedure('public.record_research_run(uuid,uuid,text,bigint,jsonb,jsonb,jsonb,text)') is not null,
  'research results are persisted through the server-only transaction function');
select ok(to_regprocedure('public.approve_research_strategy(uuid,uuid,uuid)') is not null,
  'promotion uses the server-side evidence approval function');
select ok(exists (select 1 from pg_trigger where tgname = 'research_experiment_immutable_after_run' and not tgisinternal),
  'experiment parameters cannot change after an immutable run is recorded');
select ok(exists (select 1 from pg_trigger where tgname = 'research_runs_immutable' and not tgisinternal),
  'completed run rows cannot be updated or deleted');
select ok(exists (select 1 from pg_trigger where tgname = 'research_results_immutable' and not tgisinternal),
  'completed result artifacts cannot be updated or deleted');
select ok(not has_table_privilege('authenticated', 'public.research_runs', 'INSERT'),
  'authenticated clients cannot fabricate research runs');
select ok(not has_table_privilege('authenticated', 'public.research_results', 'INSERT'),
  'authenticated clients cannot fabricate metrics or result artifacts');
select ok(not has_function_privilege('authenticated', 'public.record_research_run(uuid,uuid,text,bigint,jsonb,jsonb,jsonb,text)', 'EXECUTE'),
  'authenticated clients cannot call the server persistence function');
select ok(position('FOR UPDATE' in pg_get_functiondef('public.record_research_run(uuid,uuid,text,bigint,jsonb,jsonb,jsonb,text)'::regprocedure)) > 0,
  'run retries serialize per experiment before checking for an existing result');

select * from finish();
rollback;
