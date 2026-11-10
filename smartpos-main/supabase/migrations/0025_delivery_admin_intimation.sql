-- Platform-level delivery assignment + restaurant order intimations.
--
-- Riders are treated as a shared SmartPOS pool (users.role = 'rider') so the
-- owner admin panel can assign any available rider to any restaurant order.
-- When a rider is assigned the restaurant receives an in-app intimation so it
-- can prepare the order and keep it ready for pickup.

create table if not exists public.order_notifications (
  id bigserial primary key,
  restaurant_id text not null references public.parameters(restaurant_id) on delete cascade,
  order_id bigint references public.orders(id) on delete cascade,
  rider_id uuid references public.users(id) on delete set null,
  type text not null default 'delivery_assigned',
  title text,
  message text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_notifications_restaurant
  on public.order_notifications(restaurant_id, created_at desc);
create index if not exists idx_order_notifications_order
  on public.order_notifications(order_id);

alter table public.order_notifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'order_notifications'
      and policyname = 'open_all_order_notifications'
  ) then
    create policy open_all_order_notifications
      on public.order_notifications
      for all to anon, authenticated
      using (true) with check (true);
  end if;
end $$;

-- Speeds up the admin panel's "available riders" lookup.
create index if not exists idx_users_rider_status
  on public.users(role, rider_status)
  where role = 'rider';
