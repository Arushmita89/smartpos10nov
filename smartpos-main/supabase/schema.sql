-- SmartPOS full database schema for a fresh Supabase project.
-- Run this in the Supabase SQL editor (SQL > New query). Idempotent — safe to rerun.
-- Includes: base app tables, staff users, subscription billing, storage bucket,
-- and open anon-key policies so the app (which queries with the anon key) works.

-- ============================================================
-- 1. parameters — restaurant profile & credentials
-- ============================================================
create table if not exists public.parameters (
  restaurant_id text primary key,
  restaurant_name text not null,
  mpin text default '1234',
  created_at timestamptz default now(),
  login_name text unique,
  password text,
  password_hash text,
  gst_number text,
  phone text,
  address_line1 text,
  address_line2 text,
  address_line3 text,
  owner1 text,
  owner2 text,
  owner3 text,
  owner4 text,
  tax_rate numeric default 18,
  trial_start timestamptz,
  trial_end timestamptz,
  trial_used boolean not null default false,
  item_options jsonb not null default '[]'::jsonb,
  razorpay_key_id text,
  razorpay_key_secret text
);

-- ============================================================
-- 2. users — staff accounts & roles
-- ============================================================
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.parameters(restaurant_id) on delete cascade,
  name text not null,
  login_name text not null unique,
  password text not null,
  role text not null default 'attendant' check (role in ('admin', 'kitchen', 'attendant')),
  active boolean not null default true,
  created_at timestamptz default now()
);

create index if not exists idx_users_restaurant on public.users(restaurant_id);

-- ============================================================
-- 3. menu — menu items
-- ============================================================
create table if not exists public.menu (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.parameters(restaurant_id) on delete cascade,
  name text not null,
  description text,
  price numeric not null,
  category text not null,
  image_url text,
  available boolean default true,
  preparation_time integer default 15,
  options jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_menu_restaurant on public.menu(restaurant_id);

-- ============================================================
-- 4. categories — menu category metadata
-- ============================================================
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.parameters(restaurant_id) on delete cascade,
  name text not null,
  type text default 'predefined',
  created_at timestamptz default now(),
  unique (restaurant_id, name)
);

create index if not exists idx_categories_restaurant on public.categories(restaurant_id);

-- ============================================================
-- 5. orders — completed orders
-- ============================================================
create table if not exists public.orders (
  id bigserial primary key,
  restaurant_id text not null references public.parameters(restaurant_id) on delete cascade,
  razorpay_order_id text,
  razorpay_payment_id text,
  items jsonb not null default '[]',
  subtotal numeric default 0,
  tax numeric default 0,
  total numeric default 0,
  customer_name text,
  customer_phone text,
  customer_email text,
  customer_address text,
  payment_method text default 'cash',
  status text default 'pending',
  order_type text default 'customer',
  estimated_delivery_time integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_orders_restaurant_created on public.orders(restaurant_id, created_at desc);

-- ============================================================
-- 5b. customers — customer directory per restaurant
-- ============================================================
create table if not exists public.customers (
  id bigserial primary key,
  restaurant_id text not null references public.parameters(restaurant_id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  address text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(restaurant_id, phone)
);

create index if not exists idx_customers_restaurant_phone on public.customers(restaurant_id, phone);

-- ============================================================
-- 6. subscription_plans — subscription plan catalog
-- ============================================================
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  duration_days integer not null,
  price numeric(10, 2) not null,
  currency text not null default 'INR',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  country_code text not null default 'IN',
  plan_code text,
  restaurant_id text references public.parameters(restaurant_id) on delete cascade
);

create index if not exists idx_subscription_plans_country on public.subscription_plans(country_code);
create index if not exists idx_subscription_plans_restaurant on public.subscription_plans(restaurant_id);

-- ============================================================
-- 7. subscriptions — one active row per restaurant (keeps history)
-- ============================================================
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
  payment_status text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_billing_date timestamptz,
  cancelled_at timestamptz,
  razorpay_subscription_id text,
  updated_at timestamptz default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_restaurant on public.subscriptions(restaurant_id);

-- ============================================================
-- 8. payments — recorded Razorpay payments
-- ============================================================
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

create index if not exists idx_payments_restaurant on public.payments(restaurant_id);

-- ============================================================
-- 9. payment_methods — payment method lookup
-- ============================================================
create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 10. payment_history — one row per recorded payment
-- ============================================================
create table if not exists public.payment_history (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.subscriptions(id) on delete cascade,
  payment_method_id text,
  amount numeric(10, 2),
  currency text not null default 'INR',
  status text not null default 'captured',
  payment_gateway_id text,
  payment_gateway_response text,
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_payment_history_subscription on public.payment_history(subscription_id);

-- ============================================================
-- 11a. ingredients — raw stock items per restaurant
-- ============================================================
create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references public.parameters(restaurant_id) on delete cascade,
  name text not null,
  category text not null default 'Other',
  unit text not null default 'pcs',
  current_stock numeric not null default 0,
  reorder_level numeric not null default 0,
  low_threshold numeric not null default 0,
  critical_threshold numeric not null default 0,
  supplier_name text,
  supplier_contact text,
  cost_per_unit numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (restaurant_id, name)
);

create index if not exists idx_ingredients_restaurant on public.ingredients(restaurant_id, name);

-- ============================================================
-- 11b. stock_movements — audit log for every stock change
-- ============================================================
create table if not exists public.stock_movements (
  id bigserial primary key,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  restaurant_id text not null references public.parameters(restaurant_id) on delete cascade,
  type text not null check (type in ('order', 'waste', 'restock', 'adjustment', 'opening')),
  quantity_change numeric not null,
  reason text,
  order_id bigint references public.orders(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  before_quantity numeric,
  after_quantity numeric,
  created_at timestamptz default now()
);

create index if not exists idx_stock_movements_ingredient on public.stock_movements(ingredient_id, created_at desc);
create index if not exists idx_stock_movements_restaurant_created on public.stock_movements(restaurant_id, created_at desc);

-- ============================================================
-- 11c. recipes — how much of each ingredient a menu item uses
-- ============================================================
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  quantity_required numeric not null default 1,
  unique (menu_item_id, ingredient_id)
);

create index if not exists idx_recipes_menu_item on public.recipes(menu_item_id);
create index if not exists idx_recipes_ingredient on public.recipes(ingredient_id);

-- ============================================================
-- 12. profiles — user profiles
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text,
  full_name text,
  role text default 'admin',
  restaurant_id text references public.parameters(restaurant_id) on delete cascade,
  trial_start timestamptz,
  trial_end timestamptz,
  trial_used boolean not null default false,
  ad_free_trial_used boolean not null default false,
  ad_free_trial_end timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 12. subscription_notifications — subscription event notifications
-- ============================================================
create table if not exists public.subscription_notifications (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.subscriptions(id) on delete cascade,
  restaurant_id text references public.parameters(restaurant_id) on delete cascade,
  type text,
  title text,
  message text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_subscription_notifications_restaurant on public.subscription_notifications(restaurant_id);

-- ============================================================
-- 9. RLS — open anon policies (app queries with the anon key)
-- ============================================================
alter table public.parameters enable row level security;
alter table public.users enable row level security;
alter table public.menu enable row level security;
alter table public.categories enable row level security;
alter table public.orders enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.payment_methods enable row level security;
alter table public.payment_history enable row level security;
alter table public.profiles enable row level security;
alter table public.subscription_notifications enable row level security;
alter table public.ingredients enable row level security;
alter table public.stock_movements enable row level security;
alter table public.recipes enable row level security;

do $$
begin
  -- parameters
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'parameters' and policyname = 'open_select_parameters') then
    create policy open_select_parameters on public.parameters for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'parameters' and policyname = 'open_insert_parameters') then
    create policy open_insert_parameters on public.parameters for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'parameters' and policyname = 'open_update_parameters') then
    create policy open_update_parameters on public.parameters for update to anon, authenticated using (true) with check (true);
  end if;

  -- users
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'users' and policyname = 'anon_select_users') then
    create policy anon_select_users on public.users for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'users' and policyname = 'anon_insert_users') then
    create policy anon_insert_users on public.users for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'users' and policyname = 'anon_update_users') then
    create policy anon_update_users on public.users for update to anon, authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'users' and policyname = 'anon_delete_users') then
    create policy anon_delete_users on public.users for delete to anon, authenticated using (true);
  end if;

  -- menu
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'menu' and policyname = 'open_select_menu') then
    create policy open_select_menu on public.menu for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'menu' and policyname = 'open_insert_menu') then
    create policy open_insert_menu on public.menu for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'menu' and policyname = 'open_update_menu') then
    create policy open_update_menu on public.menu for update to anon, authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'menu' and policyname = 'open_delete_menu') then
    create policy open_delete_menu on public.menu for delete to anon, authenticated using (true);
  end if;

  -- categories
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'categories' and policyname = 'open_select_categories') then
    create policy open_select_categories on public.categories for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'categories' and policyname = 'open_insert_categories') then
    create policy open_insert_categories on public.categories for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'categories' and policyname = 'open_delete_categories') then
    create policy open_delete_categories on public.categories for delete to anon, authenticated using (true);
  end if;

  -- orders
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'orders' and policyname = 'open_select_orders') then
    create policy open_select_orders on public.orders for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'orders' and policyname = 'open_insert_orders') then
    create policy open_insert_orders on public.orders for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'orders' and policyname = 'open_update_orders') then
    create policy open_update_orders on public.orders for update to anon, authenticated using (true) with check (true);
  end if;

  -- subscription_plans
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subscription_plans' and policyname = 'open_select_subscription_plans') then
    create policy open_select_subscription_plans on public.subscription_plans for select to anon, authenticated using (true);
  end if;

  -- subscriptions
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subscriptions' and policyname = 'open_select_subscriptions') then
    create policy open_select_subscriptions on public.subscriptions for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subscriptions' and policyname = 'open_insert_subscriptions') then
    create policy open_insert_subscriptions on public.subscriptions for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subscriptions' and policyname = 'open_update_subscriptions') then
    create policy open_update_subscriptions on public.subscriptions for update to anon, authenticated using (true) with check (true);
  end if;

  -- payments
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payments' and policyname = 'open_select_payments') then
    create policy open_select_payments on public.payments for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payments' and policyname = 'open_insert_payments') then
    create policy open_insert_payments on public.payments for insert to anon, authenticated with check (true);
  end if;

  -- payment_methods
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_methods' and policyname = 'open_select_payment_methods') then
    create policy open_select_payment_methods on public.payment_methods for select to anon, authenticated using (true);
  end if;

  -- payment_history
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_history' and policyname = 'open_select_payment_history') then
    create policy open_select_payment_history on public.payment_history for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_history' and policyname = 'open_insert_payment_history') then
    create policy open_insert_payment_history on public.payment_history for insert to anon, authenticated with check (true);
  end if;

  -- profiles
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'open_select_profiles') then
    create policy open_select_profiles on public.profiles for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'open_insert_profiles') then
    create policy open_insert_profiles on public.profiles for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'open_update_profiles') then
    create policy open_update_profiles on public.profiles for update to anon, authenticated using (true) with check (true);
  end if;

  -- subscription_notifications
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subscription_notifications' and policyname = 'open_select_subscription_notifications') then
    create policy open_select_subscription_notifications on public.subscription_notifications for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subscription_notifications' and policyname = 'open_insert_subscription_notifications') then
    create policy open_insert_subscription_notifications on public.subscription_notifications for insert to anon, authenticated with check (true);
  end if;

  -- ingredients
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ingredients' and policyname = 'open_select_ingredients') then
    create policy open_select_ingredients on public.ingredients for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ingredients' and policyname = 'open_insert_ingredients') then
    create policy open_insert_ingredients on public.ingredients for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ingredients' and policyname = 'open_update_ingredients') then
    create policy open_update_ingredients on public.ingredients for update to anon, authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ingredients' and policyname = 'open_delete_ingredients') then
    create policy open_delete_ingredients on public.ingredients for delete to anon, authenticated using (true);
  end if;

  -- stock_movements
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'stock_movements' and policyname = 'open_select_stock_movements') then
    create policy open_select_stock_movements on public.stock_movements for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'stock_movements' and policyname = 'open_insert_stock_movements') then
    create policy open_insert_stock_movements on public.stock_movements for insert to anon, authenticated with check (true);
  end if;

  -- recipes
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipes' and policyname = 'open_select_recipes') then
    create policy open_select_recipes on public.recipes for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipes' and policyname = 'open_insert_recipes') then
    create policy open_insert_recipes on public.recipes for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipes' and policyname = 'open_update_recipes') then
    create policy open_update_recipes on public.recipes for update to anon, authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recipes' and policyname = 'open_delete_recipes') then
    create policy open_delete_recipes on public.recipes for delete to anon, authenticated using (true);
  end if;
end $$;

-- ============================================================
-- 10. Seed default subscription plans (adjust prices as needed)
-- ============================================================
insert into public.subscription_plans (name, duration_days, price, currency, is_active, country_code, plan_code) values
  ('Monthly Plan', 30, 999, 'INR', true, 'IN', 'MONTHLY'),
  ('Annual Plan', 365, 9999, 'INR', true, 'IN', 'ANNUAL'),
  ('Monthly Plan', 30, 49, 'USD', true, 'US', 'MONTHLY'),
  ('Annual Plan', 365, 490, 'USD', true, 'US', 'ANNUAL')
on conflict do nothing;

insert into public.payment_methods (name) values ('card'), ('netbanking'), ('upi'), ('cash')
on conflict (name) do nothing;

-- ============================================================
-- 11. Storage bucket for menu item images
-- ============================================================
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

-- ============================================================
-- 13. Customer Promotion Module (segments, coupons, campaigns,
--     redemptions, loyalty, automations)
-- ============================================================

alter table public.customers add column if not exists birthday date;
alter table public.customers add column if not exists loyalty_points numeric not null default 0;

alter table public.orders add column if not exists discount_amount numeric not null default 0;
alter table public.orders add column if not exists promo_code text;
alter table public.orders add column if not exists loyalty_points_redeemed numeric not null default 0;
alter table public.orders add column if not exists loyalty_points_earned numeric not null default 0;

create table if not exists public.customer_segments (
  id bigserial primary key,
  restaurant_id text not null references public.parameters(restaurant_id) on delete cascade,
  name text not null,
  description text,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customer_segments_restaurant on public.customer_segments(restaurant_id);

create table if not exists public.coupons (
  id bigserial primary key,
  restaurant_id text not null references public.parameters(restaurant_id) on delete cascade,
  code text not null,
  description text,
  discount_type text not null default 'percentage' check (discount_type in ('percentage', 'fixed', 'bogo')),
  discount_value numeric not null default 0,
  min_bill numeric not null default 0,
  max_discount numeric,
  scope_item_name text,
  max_uses integer,
  per_customer_limit integer not null default 1,
  starts_at timestamptz,
  ends_at timestamptz,
  redemption_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, code)
);

create index if not exists idx_coupons_restaurant on public.coupons(restaurant_id);

create table if not exists public.campaigns (
  id bigserial primary key,
  restaurant_id text not null references public.parameters(restaurant_id) on delete cascade,
  name text not null,
  segment_id bigint references public.customer_segments(id) on delete set null,
  segment_key text,
  coupon_id bigint references public.coupons(id) on delete set null,
  channel text not null check (channel in ('sms', 'whatsapp', 'email')),
  subject text,
  message text not null,
  source text not null default 'manual' check (source in ('manual', 'automation')),
  trigger_type text,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sent', 'failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  audience_count integer not null default 0,
  delivered_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_campaigns_restaurant_created on public.campaigns(restaurant_id, created_at desc);
create index if not exists idx_campaigns_due on public.campaigns(status, scheduled_at);

create table if not exists public.campaign_deliveries (
  id bigserial primary key,
  campaign_id bigint not null references public.campaigns(id) on delete cascade,
  restaurant_id text not null references public.parameters(restaurant_id) on delete cascade,
  customer_id bigint references public.customers(id) on delete set null,
  customer_name text,
  recipient text not null,
  channel text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed')),
  error text,
  message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_campaign_deliveries_campaign on public.campaign_deliveries(campaign_id);
create index if not exists idx_campaign_deliveries_recipient on public.campaign_deliveries(restaurant_id, recipient);

create table if not exists public.promotion_redemptions (
  id bigserial primary key,
  restaurant_id text not null references public.parameters(restaurant_id) on delete cascade,
  coupon_id bigint not null references public.coupons(id) on delete cascade,
  campaign_id bigint references public.campaigns(id) on delete set null,
  order_id bigint references public.orders(id) on delete set null,
  customer_phone text,
  discount_amount numeric not null default 0,
  order_total numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_promotion_redemptions_restaurant on public.promotion_redemptions(restaurant_id, created_at desc);
create index if not exists idx_promotion_redemptions_coupon on public.promotion_redemptions(coupon_id, customer_phone);
create index if not exists idx_promotion_redemptions_campaign on public.promotion_redemptions(campaign_id);

create table if not exists public.loyalty_settings (
  restaurant_id text primary key references public.parameters(restaurant_id) on delete cascade,
  enabled boolean not null default true,
  currency_per_point numeric not null default 10,
  point_value numeric not null default 0.1,
  min_redeem_points numeric not null default 100,
  max_redeem_percent numeric not null default 50,
  updated_at timestamptz not null default now()
);

create table if not exists public.loyalty_transactions (
  id bigserial primary key,
  restaurant_id text not null references public.parameters(restaurant_id) on delete cascade,
  customer_phone text not null,
  points numeric not null,
  type text not null check (type in ('earn', 'redeem', 'adjustment')),
  order_id bigint references public.orders(id) on delete set null,
  coupon_id bigint references public.coupons(id) on delete set null,
  note text,
  balance_after numeric,
  created_at timestamptz not null default now()
);

create index if not exists idx_loyalty_transactions_restaurant on public.loyalty_transactions(restaurant_id, created_at desc);
create index if not exists idx_loyalty_transactions_phone on public.loyalty_transactions(restaurant_id, customer_phone);

create table if not exists public.automations (
  id bigserial primary key,
  restaurant_id text not null references public.parameters(restaurant_id) on delete cascade,
  trigger_type text not null check (trigger_type in ('birthday', 'inactive', 'first_visit', 'high_value', 'post_purchase', 'loyalty_milestone')),
  channel text not null default 'sms' check (channel in ('sms', 'whatsapp', 'email')),
  coupon_id bigint references public.coupons(id) on delete set null,
  message text not null,
  is_active boolean not null default false,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, trigger_type)
);

create index if not exists idx_automations_restaurant on public.automations(restaurant_id);

alter table public.customer_segments enable row level security;
alter table public.coupons enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_deliveries enable row level security;
alter table public.promotion_redemptions enable row level security;
alter table public.loyalty_settings enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.automations enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customer_segments' and policyname = 'open_select_customer_segments') then
    create policy open_select_customer_segments on public.customer_segments for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customer_segments' and policyname = 'open_insert_customer_segments') then
    create policy open_insert_customer_segments on public.customer_segments for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customer_segments' and policyname = 'open_update_customer_segments') then
    create policy open_update_customer_segments on public.customer_segments for update to anon, authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customer_segments' and policyname = 'open_delete_customer_segments') then
    create policy open_delete_customer_segments on public.customer_segments for delete to anon, authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coupons' and policyname = 'open_select_coupons') then
    create policy open_select_coupons on public.coupons for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coupons' and policyname = 'open_insert_coupons') then
    create policy open_insert_coupons on public.coupons for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coupons' and policyname = 'open_update_coupons') then
    create policy open_update_coupons on public.coupons for update to anon, authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coupons' and policyname = 'open_delete_coupons') then
    create policy open_delete_coupons on public.coupons for delete to anon, authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaigns' and policyname = 'open_select_campaigns') then
    create policy open_select_campaigns on public.campaigns for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaigns' and policyname = 'open_insert_campaigns') then
    create policy open_insert_campaigns on public.campaigns for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaigns' and policyname = 'open_update_campaigns') then
    create policy open_update_campaigns on public.campaigns for update to anon, authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaigns' and policyname = 'open_delete_campaigns') then
    create policy open_delete_campaigns on public.campaigns for delete to anon, authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaign_deliveries' and policyname = 'open_select_campaign_deliveries') then
    create policy open_select_campaign_deliveries on public.campaign_deliveries for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaign_deliveries' and policyname = 'open_insert_campaign_deliveries') then
    create policy open_insert_campaign_deliveries on public.campaign_deliveries for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaign_deliveries' and policyname = 'open_update_campaign_deliveries') then
    create policy open_update_campaign_deliveries on public.campaign_deliveries for update to anon, authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaign_deliveries' and policyname = 'open_delete_campaign_deliveries') then
    create policy open_delete_campaign_deliveries on public.campaign_deliveries for delete to anon, authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'promotion_redemptions' and policyname = 'open_select_promotion_redemptions') then
    create policy open_select_promotion_redemptions on public.promotion_redemptions for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'promotion_redemptions' and policyname = 'open_insert_promotion_redemptions') then
    create policy open_insert_promotion_redemptions on public.promotion_redemptions for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'promotion_redemptions' and policyname = 'open_delete_promotion_redemptions') then
    create policy open_delete_promotion_redemptions on public.promotion_redemptions for delete to anon, authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'loyalty_settings' and policyname = 'open_select_loyalty_settings') then
    create policy open_select_loyalty_settings on public.loyalty_settings for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'loyalty_settings' and policyname = 'open_insert_loyalty_settings') then
    create policy open_insert_loyalty_settings on public.loyalty_settings for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'loyalty_settings' and policyname = 'open_update_loyalty_settings') then
    create policy open_update_loyalty_settings on public.loyalty_settings for update to anon, authenticated using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'loyalty_transactions' and policyname = 'open_select_loyalty_transactions') then
    create policy open_select_loyalty_transactions on public.loyalty_transactions for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'loyalty_transactions' and policyname = 'open_insert_loyalty_transactions') then
    create policy open_insert_loyalty_transactions on public.loyalty_transactions for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'loyalty_transactions' and policyname = 'open_delete_loyalty_transactions') then
    create policy open_delete_loyalty_transactions on public.loyalty_transactions for delete to anon, authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'automations' and policyname = 'open_select_automations') then
    create policy open_select_automations on public.automations for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'automations' and policyname = 'open_insert_automations') then
    create policy open_insert_automations on public.automations for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'automations' and policyname = 'open_update_automations') then
    create policy open_update_automations on public.automations for update to anon, authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'automations' and policyname = 'open_delete_automations') then
    create policy open_delete_automations on public.automations for delete to anon, authenticated using (true);
  end if;
end $$;

create or replace function public.increment_coupon_redemptions(p_coupon_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.coupons
  set redemption_count = redemption_count + 1, updated_at = now()
  where id = p_coupon_id;
$$;

grant execute on function public.increment_coupon_redemptions(bigint) to anon, authenticated;

create or replace function public.record_loyalty_transaction(
  p_restaurant_id text,
  p_phone text,
  p_points numeric,
  p_type text,
  p_name text default null,
  p_order_id bigint default null,
  p_note text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
begin
  update public.customers
  set loyalty_points = greatest(loyalty_points + p_points, 0),
      updated_at = now()
  where restaurant_id = p_restaurant_id and phone = p_phone
  returning loyalty_points into v_balance;

  if v_balance is null then
    v_balance := greatest(p_points, 0);
    insert into public.customers (restaurant_id, name, phone, loyalty_points)
    values (p_restaurant_id, coalesce(nullif(p_name, ''), 'Customer'), p_phone, v_balance);
  end if;

  insert into public.loyalty_transactions
    (restaurant_id, customer_phone, points, type, order_id, note, balance_after)
  values
    (p_restaurant_id, p_phone, p_points, p_type, p_order_id, p_note, v_balance);

  return v_balance;
end;
$$;

grant execute on function public.record_loyalty_transaction(text, text, numeric, text, text, bigint, text) to anon, authenticated;
