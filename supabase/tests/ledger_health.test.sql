begin;
select plan(16);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('test.empty_account', 'test-empty-ledger:' || txid_current()::text, true);
select set_config('test.chain_account', 'test-chain-ledger:' || txid_current()::text, true);
select set_config('test.state_account', 'test-state-ledger:' || txid_current()::text, true);
select set_config('test.recovery_account', 'test-recovery-ledger:' || txid_current()::text, true);

do $$
declare
  v_seq bigint;
  v_retry_seq bigint;
begin
  insert into public.paper_sim_accounts(account_id, state, version)
    values (current_setting('test.empty_account'), '{"cash":1000,"positions":[],"trades":[]}'::jsonb, 0);

  v_seq := public.append_decision_ledger_event(current_setting('test.chain_account'), 'retry-key', 'plan.created', '{"planId":"p1"}'::jsonb);
  v_retry_seq := public.append_decision_ledger_event(current_setting('test.chain_account'), 'retry-key', 'plan.created', '{"planId":"p1"}'::jsonb);
  perform set_config('test.retry_same_sequence', (v_seq = v_retry_seq)::text, true);

  perform set_config('test.first_version', public.record_paper_account_update(current_setting('test.state_account'), -1,
    '{"cash":1000,"positions":[],"trades":[]}'::jsonb, '[]'::jsonb)::text, true);
  perform set_config('test.stale_version', public.record_paper_account_update(current_setting('test.state_account'), -1,
    '{"cash":1000,"positions":[],"trades":[]}'::jsonb, '[]'::jsonb)::text, true);
end;
$$;

select public.record_paper_account_update(current_setting('test.recovery_account'), -1,
  '{"cash":1000,"positions":[],"trades":[],"processedCandles":{}}'::jsonb, '[]'::jsonb);

create or replace function public.test_fail_paper_account_update()
returns trigger language plpgsql as $$
begin
  if old.account_id = current_setting('test.recovery_account', true) then
    raise exception 'injected account write failure';
  end if;
  return new;
end;
$$;
create trigger test_fail_paper_account_update
  before update on public.paper_sim_accounts
  for each row execute function public.test_fail_paper_account_update();

select throws_ok(
  $$select public.record_paper_account_update(
    current_setting('test.recovery_account'), 0,
    '{"cash":1000,"positions":[],"trades":[],"processedCandles":{"BTCUSD:executor:15m":900}}'::jsonb,
    '[{"idempotencyKey":"recovery-event","eventType":"test.checkpoint","payload":{"candleTime":900}}]'::jsonb
  )$$,
  'P0001', 'injected account write failure', 'a failure after the ledger append aborts the account update transaction'
);

drop trigger test_fail_paper_account_update on public.paper_sim_accounts;
drop function public.test_fail_paper_account_update();

select is((select version from public.paper_sim_accounts where account_id = current_setting('test.recovery_account')), 0::bigint,
  'failed account update leaves the prior version intact');
select is((select count(*) from public.decision_ledger where account_id = current_setting('test.recovery_account') and idempotency_key = 'recovery-event'), 0::bigint,
  'failed account update rolls its ledger event back');
select is(public.record_paper_account_update(
  current_setting('test.recovery_account'), 0,
  '{"cash":1000,"positions":[],"trades":[],"processedCandles":{"BTCUSD:executor:15m":900}}'::jsonb,
  '[{"idempotencyKey":"recovery-event","eventType":"test.checkpoint","payload":{"candleTime":900}}]'::jsonb
), 1::bigint, 'retry from the unchanged version commits successfully');
select is((select state->'processedCandles'->>'BTCUSD:executor:15m' from public.paper_sim_accounts where account_id = current_setting('test.recovery_account')), '900',
  'the retried account state durably contains its candle checkpoint');
select is((select count(*) from public.decision_ledger where account_id = current_setting('test.recovery_account') and idempotency_key = 'recovery-event'), 1::bigint,
  'the retried event exists exactly once');
select is((select ok from public.verify_decision_ledger(current_setting('test.recovery_account'))), true,
  'the recovered account ledger verifies');

select is((select ok from public.verify_decision_ledger(current_setting('test.empty_account'))), true, 'an empty account ledger has no broken hash chain');
select is((select checked_rows from public.verify_decision_ledger(current_setting('test.empty_account'))), 0::bigint, 'empty ledger verification checks zero rows');
select is(current_setting('test.retry_same_sequence'), 'true', 'an idempotent retry returns the existing ledger row');
select is((select ok from public.verify_decision_ledger(current_setting('test.chain_account'))), true, 'the appended chain verifies');
select is((select checked_rows from public.verify_decision_ledger(current_setting('test.chain_account'))), 1::bigint, 'an idempotent retry does not append a second row');
select is(current_setting('test.first_version'), '0', 'first account write creates version zero and its snapshot');
select is(current_setting('test.stale_version'), '-1', 'a stale retry is rejected by optimistic version checking');
select is((public.paper_ledger_health()->>'status'), 'unverified', 'an account with no ledger rows is not reported as verified');

-- Simulate privileged tampering in this rollback-only test. Normal UPDATE is blocked by the append-only trigger.
alter table public.decision_ledger disable trigger decision_ledger_no_update_delete;
update public.decision_ledger set row_hash = repeat('0', 64)
  where account_id = current_setting('test.chain_account') and idempotency_key = 'retry-key';
alter table public.decision_ledger enable trigger decision_ledger_no_update_delete;
select is((select ok from public.verify_decision_ledger(current_setting('test.chain_account'))), false, 'full verification detects a corrupted row hash');

select * from finish();
rollback;
