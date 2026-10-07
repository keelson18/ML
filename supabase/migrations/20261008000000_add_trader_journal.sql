-- Owner-scoped Trader Desk journal tables; writes pass through auth.uid()-checked RPCs.
create table if not exists public.plan_events (
  id uuid primary key,
  plan_id uuid not null references public.trade_plans(id) on delete cascade,
  account_id uuid not null references auth.users(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor text not null check (actor in ('system', 'planner', 'executor', 'manager', 'user')),
  reason text not null,
  candle jsonb,
  timeframe text,
  engine_version text,
  occurred_at timestamptz not null
);

create table if not exists public.paper_orders (
  id uuid primary key,
  plan_id uuid not null references public.trade_plans(id) on delete cascade,
  account_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  side text not null check (side in ('long', 'short')),
  order_type text not null check (order_type in ('limit', 'stop_entry')),
  price numeric not null check (price > 0),
  quantity numeric not null check (quantity > 0),
  created_at_bar bigint not null,
  expires_at_bar bigint not null,
  status text not null check (status in ('pending', 'filled', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trade_journal (
  id uuid primary key,
  plan_id uuid references public.trade_plans(id) on delete set null,
  account_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  dataset_id text not null,
  config_hash text not null,
  engine_versions jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_reviews (
  id uuid primary key,
  account_id uuid not null references auth.users(id) on delete cascade,
  review_date date not null,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, review_date)
);

create index if not exists plan_events_owner_time_idx on public.plan_events(account_id, occurred_at desc);
create index if not exists paper_orders_owner_status_idx on public.paper_orders(account_id, status, created_at desc);
create index if not exists trade_journal_owner_time_idx on public.trade_journal(account_id, created_at desc);
create index if not exists daily_reviews_owner_date_idx on public.daily_reviews(account_id, review_date desc);

alter table public.trade_plans enable row level security;
alter table public.plan_events enable row level security;
alter table public.paper_orders enable row level security;
alter table public.trade_journal enable row level security;
alter table public.daily_reviews enable row level security;

drop policy if exists trade_plans_owner_insert on public.trade_plans;
drop policy if exists trade_plans_owner_update on public.trade_plans;
drop policy if exists trade_plans_owner_admin_read on public.trade_plans;
create policy trade_plans_owner_admin_read on public.trade_plans for select to authenticated
  using (auth.uid() = account_id or public.is_current_user_admin());

create policy plan_events_owner_admin_read on public.plan_events for select to authenticated
  using (auth.uid() = account_id or public.is_current_user_admin());
create policy paper_orders_owner_admin_read on public.paper_orders for select to authenticated
  using (auth.uid() = account_id or public.is_current_user_admin());
create policy trade_journal_owner_admin_read on public.trade_journal for select to authenticated
  using (auth.uid() = account_id or public.is_current_user_admin());
create policy daily_reviews_owner_admin_read on public.daily_reviews for select to authenticated
  using (auth.uid() = account_id or public.is_current_user_admin());

revoke all on public.trade_plans, public.plan_events, public.paper_orders, public.trade_journal, public.daily_reviews from anon, public;
revoke all on public.trade_plans, public.plan_events, public.paper_orders, public.trade_journal, public.daily_reviews from authenticated;
grant select on public.trade_plans, public.plan_events, public.paper_orders, public.trade_journal, public.daily_reviews to authenticated;

create or replace function public.save_trade_plans(p_plans jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or jsonb_typeof(p_plans) is distinct from 'array' then
    raise exception 'invalid plan batch';
  end if;
  if exists (select 1 from jsonb_array_elements(p_plans) as items(p) where p->>'accountId' is distinct from auth.uid()::text) then
    raise exception 'plan owner mismatch';
  end if;
  insert into public.trade_plans (id, account_id, symbol, status, plan, created_at, updated_at)
  select (p->>'id')::uuid, auth.uid(), p->>'symbol', p->>'status', p,
         coalesce((p->>'createdAt')::timestamptz, now()), coalesce((p->>'updatedAt')::timestamptz, now())
  from jsonb_array_elements(p_plans) as items(p)
  on conflict (id) do update set symbol = excluded.symbol, status = excluded.status, plan = excluded.plan, updated_at = excluded.updated_at
  where public.trade_plans.account_id = auth.uid();
  insert into public.plan_events (id, plan_id, account_id, from_status, to_status, actor, reason, timeframe, engine_version, occurred_at)
  select gen_random_uuid(), (p->>'id')::uuid, auth.uid(), null, p->>'status', 'planner', 'Falsifiable plan hypothesis created.',
         '4h', p#>>'{engineVersions,market-structure}', coalesce((p->>'createdAt')::timestamptz, now())
  from jsonb_array_elements(p_plans) as items(p)
  where exists (select 1 from public.trade_plans stored where stored.id = (p->>'id')::uuid and stored.account_id = auth.uid())
  on conflict (id) do nothing;
end;
$$;

create or replace function public.record_plan_events(p_events jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or jsonb_typeof(p_events) is distinct from 'array' then raise exception 'invalid event batch'; end if;
  if exists (select 1 from jsonb_array_elements(p_events) as items(e) where e->>'accountId' is distinct from auth.uid()::text) then raise exception 'event owner mismatch'; end if;
  insert into public.plan_events (id, plan_id, account_id, from_status, to_status, actor, reason, candle, timeframe, engine_version, occurred_at)
  select (e->>'id')::uuid, (e->>'planId')::uuid, auth.uid(), e->>'fromStatus', e->>'toStatus', e->>'actor', e->>'reason',
         e->'candle', e->>'timeframe', e->>'engineVersion', (e->>'occurredAt')::timestamptz
  from jsonb_array_elements(p_events) as items(e)
  on conflict (id) do nothing;
end;
$$;

create or replace function public.save_paper_orders(p_orders jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or jsonb_typeof(p_orders) is distinct from 'array' then raise exception 'invalid order batch'; end if;
  if exists (select 1 from jsonb_array_elements(p_orders) as items(o) where o->>'accountId' is distinct from auth.uid()::text) then raise exception 'order owner mismatch'; end if;
  insert into public.paper_orders (id, plan_id, account_id, symbol, side, order_type, price, quantity, created_at_bar, expires_at_bar, status)
  select (o->>'id')::uuid, (o->>'planId')::uuid, auth.uid(), o->>'symbol', o->>'side', o->>'orderType',
         (o->>'price')::numeric, (o->>'quantity')::numeric, (o->>'createdAtBar')::bigint, (o->>'expiresAtBar')::bigint, o->>'status'
  from jsonb_array_elements(p_orders) as items(o)
  on conflict (id) do update set status = excluded.status, updated_at = now()
  where public.paper_orders.account_id = auth.uid();
end;
$$;

create or replace function public.save_trade_journal(p_entries jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or jsonb_typeof(p_entries) is distinct from 'array' then raise exception 'invalid journal batch'; end if;
  if exists (select 1 from jsonb_array_elements(p_entries) as items(j) where j->>'accountId' is distinct from auth.uid()::text) then raise exception 'journal owner mismatch'; end if;
  insert into public.trade_journal (id, plan_id, account_id, symbol, dataset_id, config_hash, engine_versions, metrics, created_at)
  select (j->>'id')::uuid, nullif(j->>'planId', '')::uuid, auth.uid(), j->>'symbol', j->>'datasetId', j->>'configHash',
         coalesce(j->'engineVersions', '{}'::jsonb), coalesce(j->'metrics', '{}'::jsonb), coalesce((j->>'createdAt')::timestamptz, now())
  from jsonb_array_elements(p_entries) as items(j)
  on conflict (id) do nothing;
end;
$$;

create or replace function public.save_daily_review(p_review jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_review->>'accountId' is distinct from auth.uid()::text then raise exception 'review owner mismatch'; end if;
  insert into public.daily_reviews (id, account_id, review_date, metrics)
  values ((p_review->>'id')::uuid, auth.uid(), (p_review->>'reviewDate')::date, coalesce(p_review->'metrics', '{}'::jsonb))
  on conflict (account_id, review_date) do update set metrics = excluded.metrics;
end;
$$;

revoke all on function public.save_trade_plans(jsonb) from public, anon;
revoke all on function public.record_plan_events(jsonb) from public, anon;
revoke all on function public.save_paper_orders(jsonb) from public, anon;
revoke all on function public.save_trade_journal(jsonb) from public, anon;
revoke all on function public.save_daily_review(jsonb) from public, anon;
grant execute on function public.save_trade_plans(jsonb) to authenticated;
grant execute on function public.record_plan_events(jsonb) to authenticated;
grant execute on function public.save_paper_orders(jsonb) to authenticated;
grant execute on function public.save_trade_journal(jsonb) to authenticated;
grant execute on function public.save_daily_review(jsonb) to authenticated;
