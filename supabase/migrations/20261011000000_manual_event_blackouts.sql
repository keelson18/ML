create table if not exists public.event_blackouts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 160),
  impact text not null check (impact in ('low', 'medium', 'high')),
  asset_classes text[] not null check (cardinality(asset_classes) > 0 and asset_classes <@ array['crypto', 'forex', 'commodity', 'index', 'stock']::text[]),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create index if not exists event_blackouts_active_window_idx
  on public.event_blackouts (starts_at, ends_at) where active;

alter table public.event_blackouts enable row level security;
revoke all on public.event_blackouts from anon, authenticated;
grant select on public.event_blackouts to authenticated;
drop policy if exists event_blackouts_admin_read on public.event_blackouts;
create policy event_blackouts_admin_read on public.event_blackouts
  for select to authenticated using (public.is_current_user_admin());

create or replace function public.admin_create_event_blackout(
  p_title text,
  p_impact text,
  p_asset_classes text[],
  p_starts_at timestamptz,
  p_ends_at timestamptz
) returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null or not public.is_current_user_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if length(trim(p_title)) not between 1 and 160 or p_impact not in ('low', 'medium', 'high')
    or cardinality(p_asset_classes) = 0
    or not (p_asset_classes <@ array['crypto', 'forex', 'commodity', 'index', 'stock']::text[])
    or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'Invalid event blackout.' using errcode = '22023';
  end if;
  insert into public.event_blackouts(title, impact, asset_classes, starts_at, ends_at, created_by)
    values (trim(p_title), p_impact, p_asset_classes, p_starts_at, p_ends_at, v_actor)
    returning id into v_id;
  insert into public.admin_audit_events(actor_id, action, details)
    values (v_actor, 'event_blackout_created', jsonb_build_object('id', v_id, 'title', trim(p_title), 'impact', p_impact, 'asset_classes', p_asset_classes, 'starts_at', p_starts_at, 'ends_at', p_ends_at));
  return v_id;
end;
$$;
revoke all on function public.admin_create_event_blackout(text, text, text[], timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_create_event_blackout(text, text, text[], timestamptz, timestamptz) to authenticated;

create or replace function public.admin_cancel_event_blackout(p_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_title text;
begin
  if v_actor is null or not public.is_current_user_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  update public.event_blackouts set active = false, cancelled_at = now()
    where id = p_id and active returning title into v_title;
  if not found then raise exception 'Active event blackout not found.' using errcode = 'P0002'; end if;
  insert into public.admin_audit_events(actor_id, action, details)
    values (v_actor, 'event_blackout_cancelled', jsonb_build_object('id', p_id, 'title', v_title));
end;
$$;
revoke all on function public.admin_cancel_event_blackout(uuid) from public, anon;
grant execute on function public.admin_cancel_event_blackout(uuid) to authenticated;
