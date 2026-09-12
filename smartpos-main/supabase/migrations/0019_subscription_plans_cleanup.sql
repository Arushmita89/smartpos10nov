-- ============================================================
-- 0019: Clean up deactivated legacy subscription plans
-- Deletes the old global plans (1/3/6/12 Months, test) that were
-- deactivated by 0018, keeping only Monthly and Annual. Rows that
-- are referenced by subscription history are preserved.
-- ============================================================

delete from public.subscription_plans
where restaurant_id is null
  and is_active = false
  and not exists (
    select 1 from public.subscriptions s
    where s.plan_id = public.subscription_plans.id
  );