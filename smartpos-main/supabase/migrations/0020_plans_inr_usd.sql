-- ============================================================
-- 0020: Plans in both INR and USD
-- Ensures Monthly (999 INR / 49 USD) and Annual (9999 INR / 490 USD)
-- are the only two global plans, available in both currencies.
-- ============================================================

-- 1. Deactivate any global paid plan that is not one of the 4 canonical plans
update public.subscription_plans
set is_active = false
where restaurant_id is null
  and is_active = true
  and not (
    (plan_code = 'MONTHLY' and currency in ('INR', 'USD'))
    or (plan_code = 'ANNUAL' and currency in ('INR', 'USD'))
  );

-- 2. Align canonical rows so name/duration/country always match
update public.subscription_plans
set name = 'Monthly Plan', duration_days = 30, country_code = 'IN'
where restaurant_id is null and plan_code = 'MONTHLY' and currency = 'INR';

update public.subscription_plans
set name = 'Annual Plan', duration_days = 365, country_code = 'IN'
where restaurant_id is null and plan_code = 'ANNUAL' and currency = 'INR';

update public.subscription_plans
set name = 'Monthly Plan', duration_days = 30, country_code = 'US'
where restaurant_id is null and plan_code = 'MONTHLY' and currency = 'USD';

update public.subscription_plans
set name = 'Annual Plan', duration_days = 365, country_code = 'US'
where restaurant_id is null and plan_code = 'ANNUAL' and currency = 'USD';

-- 3. Insert any missing canonical plan (idempotent)
insert into public.subscription_plans (name, duration_days, price, currency, is_active, country_code, plan_code)
select 'Monthly Plan', 30, 999, 'INR', true, 'IN', 'MONTHLY'
where not exists (
  select 1 from public.subscription_plans
  where restaurant_id is null and plan_code = 'MONTHLY' and currency = 'INR'
);

insert into public.subscription_plans (name, duration_days, price, currency, is_active, country_code, plan_code)
select 'Annual Plan', 365, 9999, 'INR', true, 'IN', 'ANNUAL'
where not exists (
  select 1 from public.subscription_plans
  where restaurant_id is null and plan_code = 'ANNUAL' and currency = 'INR'
);

insert into public.subscription_plans (name, duration_days, price, currency, is_active, country_code, plan_code)
select 'Monthly Plan', 30, 49, 'USD', true, 'US', 'MONTHLY'
where not exists (
  select 1 from public.subscription_plans
  where restaurant_id is null and plan_code = 'MONTHLY' and currency = 'USD'
);

insert into public.subscription_plans (name, duration_days, price, currency, is_active, country_code, plan_code)
select 'Annual Plan', 365, 490, 'USD', true, 'US', 'ANNUAL'
where not exists (
  select 1 from public.subscription_plans
  where restaurant_id is null and plan_code = 'ANNUAL' and currency = 'USD'
);

-- 4. Remove leftover legacy plans that are not referenced by any subscription
delete from public.subscription_plans
where restaurant_id is null
  and is_active = false
  and not exists (
    select 1 from public.subscriptions s
    where s.plan_id = public.subscription_plans.id
  );