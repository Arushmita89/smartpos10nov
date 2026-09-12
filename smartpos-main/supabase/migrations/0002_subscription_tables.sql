-- Subscription billing for SmartPOS
-- Adds subscription_plans, subscriptions and payments tables plus trial
-- fields on parameters. Subscriptions are keyed to a restaurant
-- (restaurant_id), matching the existing data model.
-- Run this in the Supabase SQL editor (or with the Supabase CLI) before
-- using the subscription / trial / admin features.

-- Plans
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  duration_days integer not null,
  price numeric(10, 2) not null,
  currency text not null default 'INR',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Subscriptions (one active row per restaurant normally; keeps history)
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.parameters(restaurant_id) on delete cascade,
  plan_id uuid references public.subscription_plans(id),
  status text not null default 'none' check (status in ('none', 'active', 'expired')),
  subscription_start timestamptz,
  subscription_end timestamptz,
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  created_at timestamptz not null default now()
);

-- Payments
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text references public.parameters(restaurant_id) on delete cascade,
  subscription_id uuid references public.subscriptions(id),
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  amount numeric(10, 2),
  currency text not null default 'INR',
  status text not null default 'captured',
  created_at timestamptz not null default now()
);

-- Trial fields on the restaurant record (1-day ad-free trial)
alter table public.parameters
  add column if not exists trial_start timestamptz,
  add column if not exists trial_end timestamptz,
  add column if not exists trial_used boolean not null default false;

create index if not exists idx_subscriptions_restaurant on public.subscriptions(restaurant_id);
create index if not exists idx_payments_restaurant on public.payments(restaurant_id);

-- RLS (open anon policies, matching the rest of the schema)
alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;

create policy open_select_subscription_plans on public.subscription_plans
  for select to anon, authenticated using (true);

create policy open_select_subscriptions on public.subscriptions
  for select to anon, authenticated using (true);
create policy open_insert_subscriptions on public.subscriptions
  for insert to anon, authenticated with check (true);
create policy open_update_subscriptions on public.subscriptions
  for update to anon, authenticated using (true) with check (true);

create policy open_select_payments on public.payments
  for select to anon, authenticated using (true);
create policy open_insert_payments on public.payments
  for insert to anon, authenticated with check (true);

-- Seed default plans (adjust prices as needed)
insert into public.subscription_plans (name, duration_days, price) values
  ('Monthly Plan', 30, 999),
  ('Annual Plan', 365, 9999)
on conflict do nothing;
