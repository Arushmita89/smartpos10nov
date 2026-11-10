-- Add delivery/shadowfax fields to orders
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS delivery_partner text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_awb text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_tracking_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_job_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_eta timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_payload jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_error text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_booked_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_delivery_awb ON public.orders(delivery_awb);

-- Delivery zones for serviceability
CREATE TABLE IF NOT EXISTS public.delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id text NOT NULL REFERENCES public.parameters(restaurant_id) ON DELETE CASCADE,
  pincode text NOT NULL,
  fee numeric DEFAULT 0,
  min_order numeric DEFAULT 0,
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(restaurant_id, pincode)
);

ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='delivery_zones' AND policyname='open_all_delivery_zones') THEN
    CREATE POLICY open_all_delivery_zones ON public.delivery_zones FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_delivery_zones_restaurant_pincode ON public.delivery_zones(restaurant_id, pincode);
