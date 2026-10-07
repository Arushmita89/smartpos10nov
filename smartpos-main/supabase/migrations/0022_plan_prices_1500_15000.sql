-- ============================================================
-- 0022: Plan prices -> Monthly 1500 INR / Annual 15000 INR
-- INR is the single base currency for the global plan catalog.
-- Every other currency is converted from INR at runtime, so
-- non-INR global plan rows are deactivated (no hardcoded prices).
-- ============================================================

-- 1. Ensure the canonical INR plans exist (idempotent)
insert into public.subscription_plans (name, duration_days, price, currency, is_active, country_code, plan_code)
select 'Monthly Plan', 30, 1500, 'INR', true, 'IN', 'MONTHLY'
where not exists (
  select 1 from public.subscription_plans
  where restaurant_id is null and plan_code = 'MONTHLY' and currency = 'INR'
);

insert into public.subscription_plans (name, duration_days, price, currency, is_active, country_code, plan_code)
select 'Annual Plan', 365, 15000, 'INR', true, 'IN', 'ANNUAL'
where not exists (
  select 1 from public.subscription_plans
  where restaurant_id is null and plan_code = 'ANNUAL' and currency = 'INR'
);

-- 2. Apply the new prices to the global INR plans
update public.subscription_plans
set price = 1500, is_active = true
where restaurant_id is null and plan_code = 'MONTHLY' and currency = 'INR';

update public.subscription_plans
set price = 15000, is_active = true
where restaurant_id is null and plan_code = 'ANNUAL' and currency = 'INR';

-- 3. Deactivate non-INR global plans (other currencies are converted from INR)
update public.subscription_plans
set is_active = false
where restaurant_id is null
  and currency <> 'INR'
  and is_active = true;

-- 4. Remove deactivated non-INR plans that no subscription references
delete from public.subscription_plans
where restaurant_id is null
  and is_active = false
  and currency <> 'INR'
  and not exists (
    select 1 from public.subscriptions s
    where s.plan_id = public.subscription_plans.id
  );
