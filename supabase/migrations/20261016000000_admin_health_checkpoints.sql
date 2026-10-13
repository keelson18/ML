create table if not exists public.paper_ledger_verification_checkpoints (
  account_id text primary key,
  last_verified_sequence bigint not null default 0 check (last_verified_sequence >= 0),
  last_verified_hash text,
  verified_at timestamptz not null default now(),
  full_reverified_at timestamptz,
  is_broken boolean not null default false,
  broken_sequence bigint
);

alter table public.paper_ledger_verification_checkpoints enable row level security;
revoke all on public.paper_ledger_verification_checkpoints from public, anon, authenticated, service_role;
grant all on public.paper_ledger_verification_checkpoints to service_role;
grant select, insert on public.admin_audit_events to service_role;

create or replace function public.paper_ledger_health()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_account_id text;
  v_checkpoint public.paper_ledger_verification_checkpoints%rowtype;
  v_row record;
  v_expected text;
  v_last_hash text;
  v_last_sequence bigint;
  v_broken_sequence bigint;
  v_checked bigint := 0;
  v_broken bigint := 0;
  v_unverified bigint := 0;
  v_account_broken boolean;
  v_account_checked boolean;
  v_accounts bigint := 0;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  for v_account_id in select account_id from public.paper_sim_accounts order by account_id loop
    v_accounts := v_accounts + 1;
    v_account_broken := false;
    v_account_checked := false;
    select * into v_checkpoint from public.paper_ledger_verification_checkpoints where account_id = v_account_id;
    v_last_hash := case when found then v_checkpoint.last_verified_hash else null end;
    v_last_sequence := case when found then v_checkpoint.last_verified_sequence else 0 end;
    if not found then
      v_unverified := v_unverified + 1;
      continue;
    end if;
    if v_checkpoint.is_broken then
      v_broken := v_broken + 1;
      continue;
    end if;
    v_broken_sequence := null;
    for v_row in select sequence, idempotency_key, event_type, payload, prev_hash, row_hash
      from public.decision_ledger where account_id = v_account_id and sequence > v_last_sequence order by sequence loop
      if v_row.prev_hash is distinct from v_last_hash then
        v_broken := v_broken + 1;
        v_account_broken := true;
        v_broken_sequence := v_row.sequence;
        exit;
      end if;
      v_expected := encode(digest(convert_to(coalesce(v_last_hash, '') || '|' || v_account_id || '|' || v_row.idempotency_key || '|' || v_row.event_type || '|' || public.canonical_ledger_json(v_row.payload), 'UTF8'), 'sha256'), 'hex');
      if v_row.row_hash is distinct from v_expected then
        v_broken := v_broken + 1;
        v_account_broken := true;
        v_broken_sequence := v_row.sequence;
        exit;
      end if;
      v_last_hash := v_row.row_hash;
      v_last_sequence := v_row.sequence;
      v_account_checked := true;
      v_checked := v_checked + 1;
    end loop;
    if v_account_broken then
      insert into public.paper_ledger_verification_checkpoints(account_id, last_verified_sequence, last_verified_hash, verified_at, is_broken, broken_sequence)
        values (v_account_id, v_last_sequence, v_last_hash, now(), true, v_broken_sequence)
        on conflict (account_id) do update set verified_at = excluded.verified_at, is_broken = true, broken_sequence = excluded.broken_sequence;
    elsif v_account_checked and not exists (select 1 from public.decision_ledger where account_id = v_account_id and sequence > v_last_sequence) then
      insert into public.paper_ledger_verification_checkpoints(account_id, last_verified_sequence, last_verified_hash, verified_at, is_broken, broken_sequence)
        values (v_account_id, v_last_sequence, v_last_hash, now(), false, null)
        on conflict (account_id) do update set last_verified_sequence = excluded.last_verified_sequence,
          last_verified_hash = excluded.last_verified_hash, verified_at = excluded.verified_at, is_broken = false, broken_sequence = null;
    end if;
  end loop;
  return jsonb_build_object('status', case when v_broken > 0 then 'broken' when v_unverified > 0 then 'unverified' else 'verified' end,
    'checkedAccounts', v_accounts, 'brokenAccounts', v_broken, 'checkedRows', v_checked);
end;
$$;

create or replace function public.admin_reverify_paper_ledger(p_actor_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id text;
  v_result record;
  v_last_sequence bigint;
  v_last_hash text;
  v_accounts bigint := 0;
  v_broken bigint := 0;
  v_reason text;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  if not exists (select 1 from public.profiles where id = p_actor_id and role = 'admin')
    or length(trim(coalesce(p_reason, ''))) not between 3 and 300 then
    raise exception 'Admin full verification request rejected.' using errcode = '42501';
  end if;
  v_reason := regexp_replace(trim(p_reason), '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}', '[email redacted]', 'gi');
  v_reason := regexp_replace(v_reason, 'https?://[^[:space:]]+', '[url redacted]', 'gi');
  v_reason := regexp_replace(v_reason, '[A-Za-z0-9_-]{24,}', '[token redacted]', 'g');
  v_reason := regexp_replace(v_reason, '([0-9]{1,3}[.]){3}[0-9]{1,3}', '[ip redacted]', 'g');
  for v_account_id in select account_id from public.paper_sim_accounts order by account_id loop
    v_accounts := v_accounts + 1;
    v_last_sequence := null;
    v_last_hash := null;
    select * into v_result from public.verify_decision_ledger(v_account_id);
    if not v_result.ok then
      v_broken := v_broken + 1;
      insert into public.paper_ledger_verification_checkpoints(account_id, last_verified_sequence, last_verified_hash, verified_at, full_reverified_at, is_broken, broken_sequence)
        values (v_account_id, 0, null, now(), now(), true, v_result.broken_sequence)
        on conflict (account_id) do update set verified_at = excluded.verified_at, full_reverified_at = excluded.full_reverified_at,
          is_broken = true, broken_sequence = excluded.broken_sequence;
    else
      select sequence, row_hash into v_last_sequence, v_last_hash from public.decision_ledger
        where account_id = v_account_id order by sequence desc limit 1;
      insert into public.paper_ledger_verification_checkpoints(account_id, last_verified_sequence, last_verified_hash, verified_at, full_reverified_at, is_broken, broken_sequence)
        values (v_account_id, coalesce(v_last_sequence, 0), v_last_hash, now(), now(), false, null)
        on conflict (account_id) do update set last_verified_sequence = excluded.last_verified_sequence,
          last_verified_hash = excluded.last_verified_hash, verified_at = excluded.verified_at, full_reverified_at = excluded.full_reverified_at,
          is_broken = false, broken_sequence = null;
    end if;
  end loop;
  insert into public.admin_audit_events(actor_id, action, details)
    values (p_actor_id, 'paper_ledger.full_reverify', jsonb_build_object('reason', left(v_reason, 300), 'checkedAccounts', v_accounts, 'brokenAccounts', v_broken));
  return jsonb_build_object('status', case when v_broken = 0 then 'verified' else 'broken' end,
    'checkedAccounts', v_accounts, 'brokenAccounts', v_broken);
end;
$$;

revoke all on function public.paper_ledger_health() from public, anon, authenticated;
revoke all on function public.admin_reverify_paper_ledger(uuid, text) from public, anon, authenticated;
grant execute on function public.paper_ledger_health() to service_role;
grant execute on function public.admin_reverify_paper_ledger(uuid, text) to service_role;

create or replace function public.paper_accounting_health(p_starting_equity numeric, p_tolerance numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_account record;
  v_open_value numeric;
  v_realized numeric;
  v_open_fees numeric;
  v_actual numeric;
  v_expected numeric;
  v_checked bigint := 0;
  v_broken bigint := 0;
begin
  if auth.role() is distinct from 'service_role' or p_starting_equity <= 0 or p_tolerance < 0 then
    raise exception 'invalid accounting health request';
  end if;
  for v_account in select account_id, state from public.paper_sim_accounts order by account_id loop
    v_checked := v_checked + 1;
    select coalesce(sum((item.value->>'entryPrice')::numeric * (item.value->>'quantity')::numeric), 0),
      coalesce(sum((item.value->>'entryFee')::numeric), 0)
      into v_open_value, v_open_fees
      from jsonb_array_elements(coalesce(v_account.state->'positions', '[]'::jsonb)) as item(value)
      where item.value->>'status' = 'open';
    select coalesce(sum((item.value->>'realizedPnl')::numeric), 0) into v_realized
      from jsonb_array_elements(coalesce(v_account.state->'trades', '[]'::jsonb)) as item(value);
    v_actual := (v_account.state->>'cash')::numeric + v_open_value;
    v_expected := p_starting_equity + v_realized - v_open_fees;
    if abs(v_actual - v_expected) > p_tolerance then v_broken := v_broken + 1; end if;
  end loop;
  return jsonb_build_object('status', case when v_checked = 0 then 'unverified' when v_broken = 0 then 'verified' else 'broken' end,
    'checkedAccounts', v_checked, 'brokenAccounts', v_broken);
end; $$;

revoke all on function public.paper_accounting_health(numeric, numeric) from public, anon, authenticated;
grant execute on function public.paper_accounting_health(numeric, numeric) to service_role;

create or replace function public.admin_record_access_denial(p_actor_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' or p_action not in ('admin.access_denied','admin.mfa_denied')
    or not exists (select 1 from auth.users where id = p_actor_id) then
    raise exception 'Admin denial audit rejected.' using errcode = '42501';
  end if;
  insert into public.admin_audit_events(actor_id, action, details)
    values (p_actor_id, p_action, '{}'::jsonb);
end; $$;
revoke all on function public.admin_record_access_denial(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_record_access_denial(uuid, text) to service_role;

create or replace function public.admin_record_health_audit(p_action text, p_reason text, p_checked_accounts bigint default null)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_actor uuid := auth.uid();
  v_reason text;
begin
  if v_actor is null or not public.is_current_user_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if p_action not in ('admin.mfa_denied','paper_ledger.full_reverify_failed')
    or (p_action = 'admin.mfa_denied' and (coalesce(auth.jwt()->'aal', '"aal1"'::jsonb) = '"aal2"'::jsonb or p_reason <> 'Full ledger verification requires AAL2.'))
    or (p_action = 'paper_ledger.full_reverify_failed' and (coalesce(auth.jwt()->'aal', '"aal1"'::jsonb) <> '"aal2"'::jsonb or p_reason <> 'Full ledger verification failed.')) then
    raise exception 'Admin health audit action rejected.' using errcode = '42501';
  end if;
  v_reason := p_reason;
  insert into public.admin_audit_events(actor_id, action, details)
    values (v_actor, p_action, jsonb_build_object('reason', v_reason, 'checkedAccounts', p_checked_accounts));
end; $$;
revoke all on function public.admin_record_health_audit(text, text, bigint) from public, anon;
grant execute on function public.admin_record_health_audit(text, text, bigint) to authenticated;

create or replace function public.verify_paper_schema()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  required_tables text[] := array['paper_sim_accounts','decision_ledger','paper_fills','shadow_trades','paper_autopilot','autopilot_settings','paper_ledger_verification_checkpoints'];
  required_rpcs text[] := array['record_paper_account_update','set_paper_autopilot','list_enabled_paper_autopilots','pause_paper_autopilot','resume_paper_autopilot','touch_paper_autopilot_run','paper_ledger_health','paper_accounting_health','admin_reverify_paper_ledger','admin_record_health_audit','admin_record_access_denial','verify_decision_ledger','get_paper_autopilot_limits','verify_paper_schema'];
  missing text[] := array[]::text[];
  item text;
begin
  foreach item in array required_tables loop
    if to_regclass('public.' || item) is null then missing := array_append(missing, 'table:' || item); end if;
  end loop;
  foreach item in array required_rpcs loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=item) then
      missing := array_append(missing, 'rpc:' || item);
    end if;
  end loop;
  return jsonb_build_object('ok', cardinality(missing)=0, 'missing', missing);
end; $$;
revoke all on function public.verify_paper_schema() from public, anon, authenticated;
grant execute on function public.verify_paper_schema() to service_role;
