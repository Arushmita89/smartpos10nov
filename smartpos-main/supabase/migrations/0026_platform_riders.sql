-- Platform-level riders.
--
-- Riders belong to the SmartPOS platform rather than a single restaurant.
-- New riders self-register from /rider/register and start as `pending`; the
-- platform owner approves them from the admin panel before they can log in
-- and go online.

alter table public.users
  alter column restaurant_id drop not null;

alter table public.users
  add column if not exists approval_status text default 'approved'
    check (approval_status in ('pending', 'approved', 'rejected'));

update public.users
set approval_status = 'approved'
where approval_status is null;

create index if not exists idx_users_rider_approval
  on public.users(approval_status, created_at desc)
  where role = 'rider';
