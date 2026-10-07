-- Stores server-generated hypotheses before an order exists; each account sees only its own plans.
create table if not exists public.trade_plans (
  id uuid primary key,
  account_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  status text not null check (status in ('SCANNING', 'WATCHING', 'ARMED', 'PENDING_ORDER', 'OPEN', 'MANAGING', 'CLOSED', 'REVIEWED', 'EXPIRED', 'INVALIDATED', 'CANCELLED')),
  plan jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trade_plans_plan_object check (jsonb_typeof(plan) = 'object')
);

create index if not exists trade_plans_account_status_created_idx
  on public.trade_plans (account_id, status, created_at desc);

alter table public.trade_plans enable row level security;
revoke all on public.trade_plans from anon, public;
grant select, insert, update on public.trade_plans to authenticated;

drop policy if exists trade_plans_owner_select on public.trade_plans;
create policy trade_plans_owner_select on public.trade_plans
  for select to authenticated using (auth.uid() = account_id);

drop policy if exists trade_plans_owner_insert on public.trade_plans;
create policy trade_plans_owner_insert on public.trade_plans
  for insert to authenticated with check (auth.uid() = account_id);

drop policy if exists trade_plans_owner_update on public.trade_plans;
create policy trade_plans_owner_update on public.trade_plans
  for update to authenticated using (auth.uid() = account_id) with check (auth.uid() = account_id);
