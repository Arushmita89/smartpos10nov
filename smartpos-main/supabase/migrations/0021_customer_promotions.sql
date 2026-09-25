-- ============================================================
-- 0021: Customer Promotion Module
-- Segments, coupons, campaigns + deliveries, promotion
-- redemptions, loyalty (settings + ledger), automations,
-- plus promo/loyalty columns on customers and orders.
-- ============================================================

-- 1. customers: birthday + loyalty balance
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS birthday date;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS loyalty_points numeric NOT NULL DEFAULT 0;

-- 2. orders: discount + loyalty snapshot at sale time
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promo_code text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS loyalty_points_redeemed numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS loyalty_points_earned numeric NOT NULL DEFAULT 0;

-- 3. customer_segments: saved custom segments (rules are AND-combined)
CREATE TABLE IF NOT EXISTS public.customer_segments (
  id bigserial PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.parameters(restaurant_id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_segments_restaurant ON public.customer_segments(restaurant_id);

-- 4. coupons: percentage / fixed / BOGO offers
CREATE TABLE IF NOT EXISTS public.coupons (
  id bigserial PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.parameters(restaurant_id) ON DELETE CASCADE,
  code text NOT NULL,
  description text,
  discount_type text NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed', 'bogo')),
  discount_value numeric NOT NULL DEFAULT 0,
  min_bill numeric NOT NULL DEFAULT 0,
  max_discount numeric,
  scope_item_name text,
  max_uses integer,
  per_customer_limit integer NOT NULL DEFAULT 1,
  starts_at timestamptz,
  ends_at timestamptz,
  redemption_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_coupons_restaurant ON public.coupons(restaurant_id);

-- 5. campaigns: scheduled/sent promotional messages
CREATE TABLE IF NOT EXISTS public.campaigns (
  id bigserial PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.parameters(restaurant_id) ON DELETE CASCADE,
  name text NOT NULL,
  segment_id bigint REFERENCES public.customer_segments(id) ON DELETE SET NULL,
  segment_key text,
  coupon_id bigint REFERENCES public.coupons(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'email')),
  subject text,
  message text NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'automation')),
  trigger_type text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  audience_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_restaurant_created ON public.campaigns(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_due ON public.campaigns(status, scheduled_at);

-- 6. campaign_deliveries: one row per recipient per campaign
CREATE TABLE IF NOT EXISTS public.campaign_deliveries (
  id bigserial PRIMARY KEY,
  campaign_id bigint NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  restaurant_id text NOT NULL REFERENCES public.parameters(restaurant_id) ON DELETE CASCADE,
  customer_id bigint REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text,
  recipient text NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
  error text,
  message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_deliveries_campaign ON public.campaign_deliveries(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_deliveries_recipient ON public.campaign_deliveries(restaurant_id, recipient);

-- 7. promotion_redemptions: coupon used at checkout
CREATE TABLE IF NOT EXISTS public.promotion_redemptions (
  id bigserial PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.parameters(restaurant_id) ON DELETE CASCADE,
  coupon_id bigint NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  campaign_id bigint REFERENCES public.campaigns(id) ON DELETE SET NULL,
  order_id bigint REFERENCES public.orders(id) ON DELETE SET NULL,
  customer_phone text,
  discount_amount numeric NOT NULL DEFAULT 0,
  order_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_restaurant ON public.promotion_redemptions(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_coupon ON public.promotion_redemptions(coupon_id, customer_phone);
CREATE INDEX IF NOT EXISTS idx_promotion_redemptions_campaign ON public.promotion_redemptions(campaign_id);

-- 8. loyalty_settings: one row per restaurant
CREATE TABLE IF NOT EXISTS public.loyalty_settings (
  restaurant_id text PRIMARY KEY REFERENCES public.parameters(restaurant_id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  currency_per_point numeric NOT NULL DEFAULT 10,
  point_value numeric NOT NULL DEFAULT 0.1,
  min_redeem_points numeric NOT NULL DEFAULT 100,
  max_redeem_percent numeric NOT NULL DEFAULT 50,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 9. loyalty_transactions: earn/redeem ledger
CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
  id bigserial PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.parameters(restaurant_id) ON DELETE CASCADE,
  customer_phone text NOT NULL,
  points numeric NOT NULL,
  type text NOT NULL CHECK (type IN ('earn', 'redeem', 'adjustment')),
  order_id bigint REFERENCES public.orders(id) ON DELETE SET NULL,
  coupon_id bigint REFERENCES public.coupons(id) ON DELETE SET NULL,
  note text,
  balance_after numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_restaurant ON public.loyalty_transactions(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_phone ON public.loyalty_transactions(restaurant_id, customer_phone);

-- 10. automations: configured per restaurant per trigger
CREATE TABLE IF NOT EXISTS public.automations (
  id bigserial PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.parameters(restaurant_id) ON DELETE CASCADE,
  trigger_type text NOT NULL CHECK (trigger_type IN ('birthday', 'inactive', 'first_visit', 'high_value', 'post_purchase', 'loyalty_milestone')),
  channel text NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms', 'whatsapp', 'email')),
  coupon_id bigint REFERENCES public.coupons(id) ON DELETE SET NULL,
  message text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, trigger_type)
);

CREATE INDEX IF NOT EXISTS idx_automations_restaurant ON public.automations(restaurant_id);

-- 11. RLS — open anon policies (same convention as the rest of the app)
ALTER TABLE public.customer_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- customer_segments
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'customer_segments' and policyname = 'open_select_customer_segments') THEN
    create policy open_select_customer_segments on public.customer_segments for select to anon, authenticated using (true);
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'customer_segments' and policyname = 'open_insert_customer_segments') THEN
    create policy open_insert_customer_segments on public.customer_segments for insert to anon, authenticated with check (true);
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'customer_segments' and policyname = 'open_update_customer_segments') THEN
    create policy open_update_customer_segments on public.customer_segments for update to anon, authenticated using (true) with check (true);
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'customer_segments' and policyname = 'open_delete_customer_segments') THEN
    create policy open_delete_customer_segments on public.customer_segments for delete to anon, authenticated using (true);
  END IF;

  -- coupons
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'coupons' and policyname = 'open_select_coupons') THEN
    create policy open_select_coupons on public.coupons for select to anon, authenticated using (true);
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'coupons' and policyname = 'open_insert_coupons') THEN
    create policy open_insert_coupons on public.coupons for insert to anon, authenticated with check (true);
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'coupons' and policyname = 'open_update_coupons') THEN
    create policy open_update_coupons on public.coupons for update to anon, authenticated using (true) with check (true);
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'coupons' and policyname = 'open_delete_coupons') THEN
    create policy open_delete_coupons on public.coupons for delete to anon, authenticated using (true);
  END IF;

  -- campaigns
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaigns' and policyname = 'open_select_campaigns') THEN
    create policy open_select_campaigns on public.campaigns for select to anon, authenticated using (true);
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaigns' and policyname = 'open_insert_campaigns') THEN
    create policy open_insert_campaigns on public.campaigns for insert to anon, authenticated with check (true);
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaigns' and policyname = 'open_update_campaigns') THEN
    create policy open_update_campaigns on public.campaigns for update to anon, authenticated using (true) with check (true);
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaigns' and policyname = 'open_delete_campaigns') THEN
    create policy open_delete_campaigns on public.campaigns for delete to anon, authenticated using (true);
  END IF;

  -- campaign_deliveries
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaign_deliveries' and policyname = 'open_select_campaign_deliveries') THEN
    create policy open_select_campaign_deliveries on public.campaign_deliveries for select to anon, authenticated using (true);
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaign_deliveries' and policyname = 'open_insert_campaign_deliveries') THEN
    create policy open_insert_campaign_deliveries on public.campaign_deliveries for insert to anon, authenticated with check (true);
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaign_deliveries' and policyname = 'open_update_campaign_deliveries') THEN
    create policy open_update_campaign_deliveries on public.campaign_deliveries for update to anon, authenticated using (true) with check (true);
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaign_deliveries' and policyname = 'open_delete_campaign_deliveries') THEN
    create policy open_delete_campaign_deliveries on public.campaign_deliveries for delete to anon, authenticated using (true);
  END IF;

  -- promotion_redemptions
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'promotion_redemptions' and policyname = 'open_select_promotion_redemptions') THEN
    create policy open_select_promotion_redemptions on public.promotion_redemptions for select to anon, authenticated using (true);
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'promotion_redemptions' and policyname = 'open_insert_promotion_redemptions') THEN
    create policy open_insert_promotion_redemptions on public.promotion_redemptions for insert to anon, authenticated with check (true);
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'promotion_redemptions' and policyname = 'open_delete_promotion_redemptions') THEN
    create policy open_delete_promotion_redemptions on public.promotion_redemptions for delete to anon, authenticated using (true);
  END IF;

  -- loyalty_settings
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'loyalty_settings' and policyname = 'open_select_loyalty_settings') THEN
    create policy open_select_loyalty_settings on public.loyalty_settings for select to anon, authenticated using (true);
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'loyalty_settings' and policyname = 'open_insert_loyalty_settings') THEN
    create policy open_insert_loyalty_settings on public.loyalty_settings for insert to anon, authenticated with check (true);
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'loyalty_settings' and policyname = 'open_update_loyalty_settings') THEN
    create policy open_update_loyalty_settings on public.loyalty_settings for update to anon, authenticated using (true) with check (true);
  END IF;

  -- loyalty_transactions
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'loyalty_transactions' and policyname = 'open_select_loyalty_transactions') THEN
    create policy open_select_loyalty_transactions on public.loyalty_transactions for select to anon, authenticated using (true);
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'loyalty_transactions' and policyname = 'open_insert_loyalty_transactions') THEN
    create policy open_insert_loyalty_transactions on public.loyalty_transactions for insert to anon, authenticated with check (true);
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'loyalty_transactions' and policyname = 'open_delete_loyalty_transactions') THEN
    create policy open_delete_loyalty_transactions on public.loyalty_transactions for delete to anon, authenticated using (true);
  END IF;

  -- automations
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'automations' and policyname = 'open_select_automations') THEN
    create policy open_select_automations on public.automations for select to anon, authenticated using (true);
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'automations' and policyname = 'open_insert_automations') THEN
    create policy open_insert_automations on public.automations for insert to anon, authenticated with check (true);
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'automations' and policyname = 'open_update_automations') THEN
    create policy open_update_automations on public.automations for update to anon, authenticated using (true) with check (true);
  END IF;
  IF NOT EXISTS (select 1 from pg_policies where schemaname = 'public' and tablename = 'automations' and policyname = 'open_delete_automations') THEN
    create policy open_delete_automations on public.automations for delete to anon, authenticated using (true);
  END IF;
END $$;

-- 12. Atomic helpers (avoids read-modify-write races from the browser client)

CREATE OR REPLACE FUNCTION public.increment_coupon_redemptions(p_coupon_id bigint)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.coupons
  SET redemption_count = redemption_count + 1, updated_at = now()
  WHERE id = p_coupon_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_coupon_redemptions(bigint) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_loyalty_transaction(
  p_restaurant_id text,
  p_phone text,
  p_points numeric,
  p_type text,
  p_name text DEFAULT NULL,
  p_order_id bigint DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
BEGIN
  UPDATE public.customers
  SET loyalty_points = GREATEST(loyalty_points + p_points, 0),
      updated_at = now()
  WHERE restaurant_id = p_restaurant_id AND phone = p_phone
  RETURNING loyalty_points INTO v_balance;

  IF v_balance IS NULL THEN
    v_balance := GREATEST(p_points, 0);
    INSERT INTO public.customers (restaurant_id, name, phone, loyalty_points)
    VALUES (p_restaurant_id, COALESCE(NULLIF(p_name, ''), 'Customer'), p_phone, v_balance);
  END IF;

  INSERT INTO public.loyalty_transactions
    (restaurant_id, customer_phone, points, type, order_id, note, balance_after)
  VALUES
    (p_restaurant_id, p_phone, p_points, p_type, p_order_id, p_note, v_balance);

  RETURN v_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_loyalty_transaction(text, text, numeric, text, text, bigint, text) TO anon, authenticated;
