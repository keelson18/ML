create or replace function public.record_own_account_event(p_action text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_action not in ('personal_data_export', 'email_change_requested') then
    raise exception 'Unsupported account event.' using errcode = '22023';
  end if;
  insert into public.admin_audit_events(actor_id, target_user_id, action, details)
    values (v_actor, v_actor, p_action, '{}'::jsonb);
end;
$$;
revoke all on function public.record_own_account_event(text) from public, anon;
grant execute on function public.record_own_account_event(text) to authenticated;

update storage.buckets set file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';

drop policy if exists avatar_owner_insert on storage.objects;
drop policy if exists avatar_owner_update on storage.objects;

revoke update on public.in_app_notifications from authenticated;
grant update (read_at) on public.in_app_notifications to authenticated;
