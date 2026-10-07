-- Private profile images and audited, transaction-safe admin role changes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "avatar_owner_read" on storage.objects;
create policy "avatar_owner_read" on storage.objects for select to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar_owner_insert" on storage.objects;
create policy "avatar_owner_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar_owner_update" on storage.objects;
create policy "avatar_owner_update" on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar_owner_delete" on storage.objects;
create policy "avatar_owner_delete" on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  target_user_id uuid references auth.users(id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit_events enable row level security;
drop policy if exists "admin_audit_events_admin_read" on public.admin_audit_events;
create policy "admin_audit_events_admin_read" on public.admin_audit_events for select to authenticated
using (public.is_current_user_admin());
revoke all on public.admin_audit_events from anon, authenticated;
grant select on public.admin_audit_events to authenticated;

create or replace function public.admin_change_user_role(p_target_user_id uuid, p_new_role text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_old_role text;
begin
  if v_actor is null or not public.is_current_user_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if p_new_role not in ('admin', 'user') then
    raise exception 'Invalid role.' using errcode = '22023';
  end if;
  select role into v_old_role from public.profiles where id = p_target_user_id for update;
  if not found then raise exception 'User profile not found.' using errcode = 'P0002'; end if;
  if v_actor = p_target_user_id and v_old_role = 'admin' and p_new_role <> 'admin' then
    raise exception 'Admins cannot remove their own admin role.' using errcode = '23514';
  end if;
  if v_old_role = 'admin' and p_new_role <> 'admin' then
    perform pg_advisory_xact_lock(hashtext('public.profiles.admin_count'));
    if (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception 'The last administrator cannot be demoted.' using errcode = '23514';
    end if;
  end if;
  update public.profiles set role = p_new_role where id = p_target_user_id;
  insert into public.admin_audit_events(actor_id, target_user_id, action, details)
    values (v_actor, p_target_user_id, 'user_role_changed', jsonb_build_object('from', v_old_role, 'to', p_new_role));
end;
$$;
revoke all on function public.admin_change_user_role(uuid, text) from public, anon;
grant execute on function public.admin_change_user_role(uuid, text) to authenticated;
