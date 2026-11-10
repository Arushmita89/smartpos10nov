-- In-house delivery: rider role, rider assignment + live tracking.
-- Run after 0022_delivery_shadowfax.sql.

-- 1. Allow a 'rider' (delivery boy) staff role.
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'kitchen', 'attendant', 'rider'));

-- 2. Rider-specific profile fields on the existing staff table.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS vehicle_number text,
  ADD COLUMN IF NOT EXISTS rider_status text DEFAULT 'offline'
    CHECK (rider_status IN ('available', 'busy', 'offline'));

CREATE INDEX IF NOT EXISTS idx_users_restaurant_role
  ON public.users(restaurant_id, role);

-- 3. Per-restaurant delivery mode: own riders, aggregator, or both.
--    Default keeps the previous behaviour (external aggregator).
ALTER TABLE public.parameters
  ADD COLUMN IF NOT EXISTS delivery_mode text DEFAULT 'aggregator';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'parameters_delivery_mode_check'
  ) THEN
    ALTER TABLE public.parameters
      ADD CONSTRAINT parameters_delivery_mode_check
      CHECK (delivery_mode IN ('own', 'aggregator', 'both'));
  END IF;
END $$;

-- 4. Delivery assignment (one active row per order, updated through lifecycle).
CREATE TABLE IF NOT EXISTS public.delivery_assignments (
  id bigserial PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.parameters(restaurant_id) ON DELETE CASCADE,
  order_id bigint NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  rider_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'accepted', 'picked_up', 'delivered', 'cancelled')),
  assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  notes text,
  assigned_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_assignments_restaurant
  ON public.delivery_assignments(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_rider
  ON public.delivery_assignments(rider_id, status);

ALTER TABLE public.delivery_assignments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'delivery_assignments'
      AND policyname = 'open_all_delivery_assignments'
  ) THEN
    CREATE POLICY open_all_delivery_assignments
      ON public.delivery_assignments
      FOR ALL TO anon, authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 5. Rider GPS breadcrumbs for live customer tracking.
CREATE TABLE IF NOT EXISTS public.rider_locations (
  id bigserial PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES public.parameters(restaurant_id) ON DELETE CASCADE,
  rider_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  order_id bigint REFERENCES public.orders(id) ON DELETE CASCADE,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  recorded_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rider_locations_rider
  ON public.rider_locations(rider_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_locations_order
  ON public.rider_locations(order_id, recorded_at DESC);

ALTER TABLE public.rider_locations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'rider_locations'
      AND policyname = 'open_all_rider_locations'
  ) THEN
    CREATE POLICY open_all_rider_locations
      ON public.rider_locations
      FOR ALL TO anon, authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 6. Denormalised rider reference + customer coordinates on orders so rider
--    mode and the tracking page can query cheaply.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_rider_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_latitude double precision,
  ADD COLUMN IF NOT EXISTS customer_longitude double precision;

CREATE INDEX IF NOT EXISTS idx_orders_delivery_rider
  ON public.orders(delivery_rider_id, delivery_status);


