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
  v_has_checkpoint boolean;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service role required'; end if;
  for v_account_id in select account_id from public.paper_sim_accounts order by account_id loop
    -- Serialize verification with account writes, which take this same per-account advisory lock.
    perform pg_advisory_xact_lock(hashtextextended(v_account_id, 0));
    v_accounts := v_accounts + 1;
    v_account_broken := false;
    v_account_checked := false;
    select * into v_checkpoint from public.paper_ledger_verification_checkpoints where account_id = v_account_id;
    v_has_checkpoint := found;
    v_last_hash := case when v_has_checkpoint then v_checkpoint.last_verified_hash else null end;
    v_last_sequence := case when v_has_checkpoint then v_checkpoint.last_verified_sequence else 0 end;

    if v_has_checkpoint and v_checkpoint.is_broken then
      v_broken := v_broken + 1;
      continue;
    end if;

    -- First observation verifies the full chain before creating a checkpoint.
    -- An account with no ledger rows has no evidence to verify and stays unverified.
    if not v_has_checkpoint then
      if not exists (select 1 from public.decision_ledger where account_id = v_account_id) then
        v_unverified := v_unverified + 1;
        continue;
      end if;
      v_last_hash := null;
      v_last_sequence := 0;
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
  return jsonb_build_object('status', case when v_accounts = 0 or v_unverified > 0 then 'unverified' when v_broken > 0 then 'broken' else 'verified' end,
    'checkedAccounts', v_accounts, 'brokenAccounts', v_broken, 'checkedRows', v_checked);
end;
$$;

revoke all on function public.paper_ledger_health() from public, anon, authenticated;
grant execute on function public.paper_ledger_health() to service_role;
