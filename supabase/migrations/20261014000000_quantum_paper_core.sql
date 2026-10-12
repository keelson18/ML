create extension if not exists pgcrypto;

create table if not exists public.decision_ledger (
  sequence bigint generated always as identity primary key,
  account_id text not null,
  idempotency_key text not null,
  event_type text not null,
  payload jsonb not null,
  prev_hash text,
  row_hash text not null,
  created_at timestamptz not null default now(),
  unique (account_id, idempotency_key)
);

create index if not exists decision_ledger_account_sequence_idx
  on public.decision_ledger (account_id, sequence desc);

create or replace function public.reject_decision_ledger_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'decision ledger is append-only';
end;
$$;

create trigger decision_ledger_no_update_delete
  before update or delete on public.decision_ledger
  for each row execute function public.reject_decision_ledger_mutation();

create table if not exists public.paper_fills (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  order_id text not null,
  position_id text,
  symbol text not null,
  side text not null check (side in ('buy', 'sell')),
  quantity numeric not null check (quantity > 0),
  price numeric not null check (price > 0),
  fee numeric not null default 0 check (fee >= 0),
  slippage numeric not null default 0 check (slippage >= 0),
  filled_at timestamptz not null,
  candle_time bigint not null,
  idempotency_key text not null,
  unique (account_id, idempotency_key)
);

create table if not exists public.shadow_trades (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  plan_id text not null,
  symbol text not null,
  candle_time bigint not null,
  reason text not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (account_id, idempotency_key)
);

create table if not exists public.paper_autopilot (
  account_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  symbols text[] not null default array['BTCUSD', 'ETHUSD', 'SOLUSD'],
  paused_reason text,
  last_run_at timestamptz,
  updated_at timestamptz not null default now(),
  check (cardinality(symbols) between 1 and 3),
  check (symbols <@ array['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD', 'ADAUSD', 'DOGEUSD', 'AVAXUSD', 'LINKUSD', 'DOTUSD', 'POLUSD', 'LTCUSD', 'BCHUSD', 'XLMUSD', 'UNIUSD', 'ATOMUSD', 'ETCUSD', 'FILUSD', 'NEARUSD', 'APTUSD'])
);

alter table public.decision_ledger enable row level security;
alter table public.paper_fills enable row level security;
alter table public.shadow_trades enable row level security;
alter table public.paper_autopilot enable row level security;

create policy decision_ledger_owner_admin_read on public.decision_ledger for select to authenticated
  using (account_id = auth.uid()::text or public.is_current_user_admin());
create policy paper_fills_owner_admin_read on public.paper_fills for select to authenticated
  using (account_id = auth.uid()::text or public.is_current_user_admin());
create policy shadow_trades_owner_admin_read on public.shadow_trades for select to authenticated
  using (account_id = auth.uid()::text or public.is_current_user_admin());
create policy paper_autopilot_owner_admin_read on public.paper_autopilot for select to authenticated
  using (account_id = auth.uid() or public.is_current_user_admin());

revoke all on public.decision_ledger, public.paper_fills, public.shadow_trades, public.paper_autopilot from public, anon, authenticated, service_role;
grant select on public.decision_ledger, public.paper_fills, public.shadow_trades, public.paper_autopilot to authenticated, service_role;
revoke all on public.paper_sim_accounts from public, anon, authenticated, service_role;
grant select on public.paper_sim_accounts to authenticated, service_role;

create or replace function public.canonical_ledger_json(p_value jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_result text;
begin
  case jsonb_typeof(p_value)
    when 'object' then
      select '{' || coalesce(string_agg(to_jsonb(key)::text || ':' || public.canonical_ledger_json(value), ',' order by key collate "C"), '') || '}'
        into v_result from jsonb_each(p_value);
      return v_result;
    when 'array' then
      select '[' || coalesce(string_agg(public.canonical_ledger_json(value), ',' order by ordinal), '') || ']'
        into v_result from jsonb_array_elements(p_value) with ordinality as elements(value, ordinal);
      return v_result;
    else
      return p_value::text;
  end case;
end;
$$;

create or replace function public.append_decision_ledger_event(
  p_account_id text,
  p_idempotency_key text,
  p_event_type text,
  p_payload jsonb
) returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_previous_hash text;
  v_existing public.decision_ledger%rowtype;
  v_hash text;
  v_sequence bigint;
begin
  select * into v_existing from public.decision_ledger
    where account_id = p_account_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.event_type is distinct from p_event_type or v_existing.payload is distinct from p_payload then
      raise exception 'idempotency key reused with different ledger payload';
    end if;
    return v_existing.sequence;
  end if;

  select row_hash into v_previous_hash from public.decision_ledger
    where account_id = p_account_id order by sequence desc limit 1;
  v_hash := encode(digest(convert_to(coalesce(v_previous_hash, '') || '|' || p_account_id || '|' || p_idempotency_key || '|' || p_event_type || '|' || public.canonical_ledger_json(p_payload), 'UTF8'), 'sha256'), 'hex');
  insert into public.decision_ledger(account_id, idempotency_key, event_type, payload, prev_hash, row_hash)
    values (p_account_id, p_idempotency_key, p_event_type, p_payload, v_previous_hash, v_hash)
    returning sequence into v_sequence;
  return v_sequence;
end;
$$;

do $$
declare
  v_account record;
begin
  for v_account in select account_id, state from public.paper_sim_accounts a
    where not exists (select 1 from public.decision_ledger l where l.account_id = a.account_id and l.idempotency_key = 'account-backfill:v1')
    order by account_id loop
    perform public.append_decision_ledger_event(v_account.account_id, 'account-backfill:v1', 'account.backfill', v_account.state);
  end loop;
end;
$$;

create or replace function public.record_paper_ledger_projection(p_account_id text, p_event jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if p_event->>'eventType' = 'paper.fill' then
    insert into public.paper_fills(account_id, order_id, position_id, symbol, side, quantity, price, fee, slippage, filled_at, candle_time, idempotency_key)
    values(p_account_id, p_event->'payload'->>'orderId', p_event->'payload'->'position'->>'id',
      p_event->'payload'->'position'->>'symbol', p_event->'payload'->'position'->>'side',
      (p_event->'payload'->'position'->>'quantity')::numeric, (p_event->'payload'->'position'->>'entryPrice')::numeric,
      coalesce((p_event->'payload'->'position'->>'entryFee')::numeric, 0),
      coalesce((p_event->'payload'->'position'->>'entrySlippage')::numeric, 0),
      (p_event->'payload'->'position'->>'openedAt')::timestamptz, (p_event->'payload'->>'candleTime')::bigint,
      p_event->>'idempotencyKey')
    on conflict (account_id, idempotency_key) do nothing;
  elsif p_event->>'eventType' = 'paper.fill.exit' then
    insert into public.paper_fills(account_id, order_id, position_id, symbol, side, quantity, price, fee, slippage, filled_at, candle_time, idempotency_key)
    values(p_account_id, p_event->'payload'->>'positionId', p_event->'payload'->>'positionId',
      p_event->'payload'->>'symbol', case when p_event->'payload'->>'side' = 'buy' then 'sell' else 'buy' end,
      (p_event->'payload'->>'quantity')::numeric, (p_event->'payload'->>'exitPrice')::numeric,
      coalesce((p_event->'payload'->>'exitFee')::numeric, 0), coalesce((p_event->'payload'->>'exitSlippage')::numeric, 0),
      (p_event->'payload'->>'closedAt')::timestamptz, floor(extract(epoch from (p_event->'payload'->>'closedAt')::timestamptz))::bigint,
      p_event->>'idempotencyKey')
    on conflict (account_id, idempotency_key) do nothing;
  elsif p_event->>'eventType' = 'shadow.signal' then
    insert into public.shadow_trades(account_id, plan_id, symbol, candle_time, reason, idempotency_key)
    values(p_account_id, p_event->'payload'->>'planId', p_event->'payload'->>'symbol',
      (p_event->'payload'->>'candleTime')::bigint, p_event->'payload'->>'reason', p_event->>'idempotencyKey')
    on conflict (account_id, idempotency_key) do nothing;
  end if;
end;
$$;

create or replace function public.record_paper_account_update(
  p_account_id text,
  p_expected_version bigint,
  p_state jsonb,
  p_events jsonb
) returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_current_state jsonb;
  v_current_version bigint;
  v_next_version bigint;
  v_event jsonb;
begin
  if auth.role() is distinct from 'service_role' or p_account_id is null or jsonb_typeof(p_state) is distinct from 'object' or jsonb_typeof(p_events) is distinct from 'array' then
    raise exception 'invalid paper account update';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_account_id, 0));
  select state, version into v_current_state, v_current_version from public.paper_sim_accounts
    where account_id = p_account_id for update;

  if not found then
    if p_expected_version <> -1 then return -1; end if;
    insert into public.paper_sim_accounts(account_id, state, version) values (p_account_id, p_state, 0);
    perform public.append_decision_ledger_event(p_account_id, 'account-state:0', 'account.snapshot', p_state);
    for v_event in select value from jsonb_array_elements(p_events) loop
      perform public.append_decision_ledger_event(p_account_id, v_event->>'idempotencyKey', v_event->>'eventType', v_event->'payload');
      perform public.record_paper_ledger_projection(p_account_id, v_event);
    end loop;
    return 0;
  end if;

  if v_current_version <> p_expected_version then return -1; end if;
  if not exists (select 1 from public.decision_ledger where account_id = p_account_id) then
    perform public.append_decision_ledger_event(p_account_id, 'account-backfill:v1', 'account.backfill', v_current_state);
  end if;
  v_next_version := v_current_version + 1;
  for v_event in select value from jsonb_array_elements(p_events) loop
    perform public.append_decision_ledger_event(p_account_id, v_event->>'idempotencyKey', v_event->>'eventType', v_event->'payload');
    perform public.record_paper_ledger_projection(p_account_id, v_event);
  end loop;
  perform public.append_decision_ledger_event(p_account_id, 'account-state:' || v_next_version::text, 'account.snapshot', p_state);
  update public.paper_sim_accounts set state = p_state, version = v_next_version where account_id = p_account_id;
  return v_next_version;
end;
$$;

create or replace function public.verify_decision_ledger(p_account_id text)
returns table(ok boolean, checked_rows bigint, last_hash text, broken_sequence bigint)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row record;
  v_expected text;
  v_count bigint := 0;
  v_last text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  for v_row in select * from public.decision_ledger where account_id = p_account_id order by sequence loop
    if v_row.prev_hash is distinct from v_last then
      return query select false, v_count, v_last, v_row.sequence;
      return;
    end if;
    v_expected := encode(digest(convert_to(coalesce(v_last, '') || '|' || p_account_id || '|' || v_row.idempotency_key || '|' || v_row.event_type || '|' || public.canonical_ledger_json(v_row.payload), 'UTF8'), 'sha256'), 'hex');
    if v_row.row_hash is distinct from v_expected then
      return query select false, v_count, v_last, v_row.sequence;
      return;
    end if;
    v_last := v_row.row_hash;
    v_count := v_count + 1;
  end loop;
  return query select true, v_count, v_last, null::bigint;
end;
$$;

create or replace function public.paper_ledger_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id text;
  v_result record;
  v_state jsonb;
  v_ledger_state jsonb;
  v_total bigint := 0;
  v_broken bigint := 0;
  v_reconciliation_failures bigint := 0;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  for v_account_id in select account_id from public.paper_sim_accounts loop
    select * into v_result from public.verify_decision_ledger(v_account_id);
    v_total := v_total + 1;
    if not v_result.ok then v_broken := v_broken + 1; end if;
    select state into v_state from public.paper_sim_accounts where account_id = v_account_id;
    select payload into v_ledger_state from public.decision_ledger where account_id = v_account_id
      and event_type in ('account.snapshot', 'account.backfill') order by sequence desc limit 1;
    if v_state is distinct from v_ledger_state then v_reconciliation_failures := v_reconciliation_failures + 1; end if;
  end loop;
  return jsonb_build_object('status', case when v_broken = 0 and v_reconciliation_failures = 0 then 'verified' else 'broken' end,
    'checkedAccounts', v_total, 'brokenAccounts', v_broken, 'reconciliationFailures', v_reconciliation_failures);
end;
$$;

create or replace function public.set_paper_autopilot(p_enabled boolean, p_symbols text[])
returns public.paper_autopilot
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.paper_autopilot%rowtype;
begin
  if auth.uid() is null or p_enabled is null or coalesce(cardinality(p_symbols), 0) not between 1 and 3
    or cardinality(p_symbols) <> (select count(distinct symbol) from unnest(p_symbols) as symbols(symbol))
    or not (p_symbols <@ array['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD', 'ADAUSD', 'DOGEUSD', 'AVAXUSD', 'LINKUSD', 'DOTUSD', 'POLUSD', 'LTCUSD', 'BCHUSD', 'XLMUSD', 'UNIUSD', 'ATOMUSD', 'ETCUSD', 'FILUSD', 'NEARUSD', 'APTUSD']) then
    raise exception 'invalid autopilot symbols';
  end if;
  perform pg_advisory_xact_lock(hashtext('paper-autopilot-symbol-cap'));
  if p_enabled and (select count(*) from (
      select distinct symbol from unnest(p_symbols) as requested(symbol)
      union
      select distinct configured.symbol from public.paper_autopilot p cross join lateral unnest(p.symbols) as configured(symbol)
        where p.enabled and p.account_id <> auth.uid()
    ) as active_symbols) > 5 then
    raise exception 'Global autopilot symbol limit of 5 reached.';
  end if;
  insert into public.paper_autopilot(account_id, enabled, symbols, paused_reason, updated_at)
    values (auth.uid(), p_enabled, p_symbols, null, now())
    on conflict (account_id) do update set enabled = excluded.enabled, symbols = excluded.symbols, paused_reason = null, updated_at = now()
    returning * into v_account;
  return v_account;
end;
$$;

create or replace function public.list_enabled_paper_autopilots()
returns setof public.paper_autopilot
language sql
security definer
set search_path = public
as $$
  select * from public.paper_autopilot where enabled order by updated_at, account_id
$$;

create or replace function public.pause_paper_autopilot(p_account_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  update public.paper_autopilot set paused_reason = p_reason, updated_at = now() where account_id = p_account_id and enabled;
end;
$$;

create or replace function public.resume_paper_autopilot(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  update public.paper_autopilot set paused_reason = null, updated_at = now() where account_id = p_account_id and enabled;
end;
$$;

create or replace function public.touch_paper_autopilot_run(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  update public.paper_autopilot set last_run_at = now(), updated_at = now() where account_id = p_account_id and enabled;
end;
$$;

revoke all on function public.append_decision_ledger_event(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.record_paper_ledger_projection(text, jsonb) from public, anon, authenticated;
revoke all on function public.record_paper_account_update(text, bigint, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.verify_decision_ledger(text) from public, anon, authenticated;
revoke all on function public.paper_ledger_health() from public, anon, authenticated;
revoke all on function public.set_paper_autopilot(boolean, text[]) from public, anon;
revoke all on function public.list_enabled_paper_autopilots() from public, anon, authenticated;
revoke all on function public.pause_paper_autopilot(uuid, text) from public, anon, authenticated;
revoke all on function public.touch_paper_autopilot_run(uuid) from public, anon, authenticated;
revoke all on function public.resume_paper_autopilot(uuid) from public, anon, authenticated;
grant execute on function public.record_paper_account_update(text, bigint, jsonb, jsonb) to service_role;
grant execute on function public.verify_decision_ledger(text) to service_role;
grant execute on function public.paper_ledger_health() to service_role;
grant execute on function public.set_paper_autopilot(boolean, text[]) to authenticated;
grant execute on function public.list_enabled_paper_autopilots() to service_role;
grant execute on function public.pause_paper_autopilot(uuid, text) to service_role;
grant execute on function public.touch_paper_autopilot_run(uuid) to service_role;
grant execute on function public.resume_paper_autopilot(uuid) to service_role;
