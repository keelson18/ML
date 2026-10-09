create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null,
  title text not null,
  summary text not null default '',
  symbols text[] not null default '{}',
  published_at timestamptz,
  ingested_at timestamptz not null default now(),
  unique (provider, external_id)
);
create index if not exists news_items_ingested_at_idx on public.news_items (ingested_at desc);
create index if not exists news_items_symbols_idx on public.news_items using gin (symbols);
alter table public.news_items enable row level security;
revoke all on public.news_items from anon, authenticated;
grant select on public.news_items to authenticated;
create policy news_items_authenticated_read on public.news_items
  for select to authenticated using (auth.uid() is not null);
create policy news_items_admin_read on public.news_items
  for select to authenticated using (public.is_current_user_admin());

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null,
  title text not null,
  impact text not null check (impact in ('low', 'medium', 'high')),
  asset_classes text[] not null default '{}',
  symbols text[] not null default '{}',
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  ingested_at timestamptz not null default now(),
  unique (provider, external_id)
);
create index if not exists calendar_events_starts_at_idx on public.calendar_events (starts_at);
alter table public.calendar_events enable row level security;
revoke all on public.calendar_events from anon, authenticated;
grant select on public.calendar_events to authenticated;
create policy calendar_events_authenticated_read on public.calendar_events
  for select to authenticated using (auth.uid() is not null);
create policy calendar_events_admin_read on public.calendar_events
  for select to authenticated using (public.is_current_user_admin());

create or replace function public.prevent_ingested_at_change()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.ingested_at is distinct from old.ingested_at then
    raise exception 'ingested_at is immutable.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger news_items_ingested_at_immutable before update on public.news_items
  for each row execute function public.prevent_ingested_at_change();
create trigger calendar_events_ingested_at_immutable before update on public.calendar_events
  for each row execute function public.prevent_ingested_at_change();

create table if not exists public.in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null default '',
  href text not null default '/news',
  source_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists in_app_notifications_unread_idx
  on public.in_app_notifications (user_id, created_at desc) where read_at is null;
create unique index if not exists in_app_notifications_source_idx
  on public.in_app_notifications (user_id, notification_type, source_id) where source_id is not null;
alter table public.in_app_notifications enable row level security;
revoke all on public.in_app_notifications from anon, authenticated;
grant select, update (read_at) on public.in_app_notifications to authenticated;
create policy in_app_notifications_owner_read on public.in_app_notifications
  for select to authenticated using (auth.uid() = user_id);
create policy in_app_notifications_admin_read on public.in_app_notifications
  for select to authenticated using (public.is_current_user_admin());
create policy in_app_notifications_owner_update on public.in_app_notifications
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.notify_on_published_cms_content()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.published is true then return new; end if;
  if new.published is true and new.content_type in ('article', 'announcement') then
    insert into public.in_app_notifications(user_id, notification_type, title, body, href, source_id)
      select p.user_id, 'news', new.title, coalesce(new.excerpt, ''), '/news', new.id
      from public.user_preferences p
      where p.notifications -> 'news' = 'true'::jsonb
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger cms_published_news_notification
  after insert or update on public.cms_content
  for each row execute function public.notify_on_published_cms_content();

create or replace function public.notify_on_ingested_news_item()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.in_app_notifications(user_id, notification_type, title, body, href, source_id)
    select p.user_id, 'news', new.title, coalesce(new.summary, ''), '/news', new.id
    from public.user_preferences p
    where p.notifications -> 'news' = 'true'::jsonb
  on conflict do nothing;
  return new;
end;
$$;
create trigger ingested_news_notification
  after insert on public.news_items
  for each row execute function public.notify_on_ingested_news_item();

alter table public.trade_journal add column if not exists active_event_ids text[] not null default '{}';
