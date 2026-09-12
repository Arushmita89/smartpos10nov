-- ============================================================
-- 0018: Keep only Monthly (₹999) and Annual (₹9,999) plans
-- Deactivates all other global paid plans and upserts the two
-- current plans shown on the "Simple & Affordable Pricing" page.
-- ============================================================

-- 1. Deactivate every global paid plan (keep rows for history)
update public.subscription_plans
set is_active = false
where restaurant_id is null
  and is_active = true;

-- 2. Ensure exactly the Monthly and Annual plans are active (idempotent)
do $$
begin
  if not exists (
    select 1 from public.subscription_plans
    where name = 'Monthly Plan' and restaurant_id is null and is_active = true
  ) then
    insert into public.subscription_plans (name, duration_days, price, currency, is_active, country_code, plan_code)
    values ('Monthly Plan', 30, 999, 'INR', true, 'IN', 'MONTHLY');
  end if;

  if not exists (
    select 1 from public.subscription_plans
    where name = 'Annual Plan' and restaurant_id is null and is_active = true
  ) then
    insert into public.subscription_plans (name, duration_days, price, currency, is_active, country_code, plan_code)
    values ('Annual Plan', 365, 9999, 'INR', true, 'IN', 'ANNUAL');
  end if;
end $$;