create or replace function public.list_enabled_paper_autopilots()
returns setof public.paper_autopilot
language sql
security definer
set search_path = public
as $$
  select autopilot.*
  from public.paper_autopilot as autopilot
  where autopilot.enabled
    or exists (
      select 1
      from public.paper_sim_accounts as account
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(account.state -> 'positions') = 'array' then account.state -> 'positions'
          else '[]'::jsonb
        end
      ) as position(value)
      where account.account_id = autopilot.account_id::text
        and position.value ->> 'status' = 'open'
    )
  order by autopilot.updated_at, autopilot.account_id;
$$;

revoke all on function public.list_enabled_paper_autopilots() from public, anon, authenticated;
grant execute on function public.list_enabled_paper_autopilots() to service_role;
