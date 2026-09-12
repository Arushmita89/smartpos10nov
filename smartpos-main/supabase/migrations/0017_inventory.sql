-- ============================================================
-- 0017: Ingredient-based inventory system
-- Tracks raw ingredients and supplies consumed by menu items.
-- Tables: ingredients, stock_movements, recipes
-- ============================================================

-- ------------------------------------------------------------
-- 1. ingredients — raw stock items per restaurant
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ingredients (
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

CREATE INDEX IF NOT EXISTS idx_ingredients_restaurant ON public.ingredients(restaurant_id, name);

-- ------------------------------------------------------------
-- 2. stock_movements — audit log for every stock change
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_movements (
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

CREATE INDEX IF NOT EXISTS idx_stock_movements_ingredient ON public.stock_movements(ingredient_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_stock_movements_restaurant_created ON public.stock_movements(restaurant_id, created_at desc);

-- ------------------------------------------------------------
-- 3. recipes — how much of each ingredient a menu item consumes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recipes (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  quantity_required numeric not null default 1,
  unique (menu_item_id, ingredient_id)
);

CREATE INDEX IF NOT EXISTS idx_recipes_menu_item ON public.recipes(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_recipes_ingredient ON public.recipes(ingredient_id);

-- ============================================================
-- RLS — open anon policies (app queries with the anon key)
-- ============================================================
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- ingredients
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ingredients' AND policyname = 'open_select_ingredients') THEN
    CREATE POLICY open_select_ingredients ON public.ingredients FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ingredients' AND policyname = 'open_insert_ingredients') THEN
    CREATE POLICY open_insert_ingredients ON public.ingredients FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ingredients' AND policyname = 'open_update_ingredients') THEN
    CREATE POLICY open_update_ingredients ON public.ingredients FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ingredients' AND policyname = 'open_delete_ingredients') THEN
    CREATE POLICY open_delete_ingredients ON public.ingredients FOR DELETE TO anon, authenticated USING (true);
  END IF;

  -- stock_movements
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'stock_movements' AND policyname = 'open_select_stock_movements') THEN
    CREATE POLICY open_select_stock_movements ON public.stock_movements FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'stock_movements' AND policyname = 'open_insert_stock_movements') THEN
    CREATE POLICY open_insert_stock_movements ON public.stock_movements FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;

  -- recipes
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'recipes' AND policyname = 'open_select_recipes') THEN
    CREATE POLICY open_select_recipes ON public.recipes FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'recipes' AND policyname = 'open_insert_recipes') THEN
    CREATE POLICY open_insert_recipes ON public.recipes FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'recipes' AND policyname = 'open_update_recipes') THEN
    CREATE POLICY open_update_recipes ON public.recipes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'recipes' AND policyname = 'open_delete_recipes') THEN
    CREATE POLICY open_delete_recipes ON public.recipes FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $$;