-- ============================================================
--  LUXE SHOP — Supabase SQL Schema
--  Run this entire file in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── 1. EXTENSIONS ────────────────────────────────────────
-- uuid_generate_v4() is used for default primary keys
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ── 2. PROFILES TABLE ────────────────────────────────────
-- Mirrors auth.users and stores extra user metadata.
-- Automatically populated on signup via a trigger.

CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  full_name    TEXT,
  avatar_url   TEXT,
  phone        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger: auto-create profile row when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── 3. PRODUCTS TABLE ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name         TEXT NOT NULL,
  description  TEXT,
  price        NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  image_url    TEXT,
  category     TEXT DEFAULT 'general',
  badge        TEXT,          -- e.g. 'New', 'Sale', 'Hot'
  rating       NUMERIC(2, 1) CHECK (rating >= 0 AND rating <= 5),
  stock        INTEGER DEFAULT 100 CHECK (stock >= 0),
  is_active    BOOLEAN DEFAULT TRUE
);

-- Sample seed data (remove or modify as needed)
INSERT INTO public.products (name, description, price, image_url, category, badge, rating) VALUES
  ('Ceramic Pour-Over Set',      'Hand-thrown stoneware with a matte finish. Brews the perfect cup.', 2499, 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&q=80', 'lifestyle',    'New',  4.8),
  ('Linen Weekend Tote',         'Washed linen with leather handles. Built for weekend escapes.',    1899, 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&q=80', 'accessories',  NULL,   4.7),
  ('Merino Wool Crewneck',       'Grade-A merino from New Zealand. Naturally temperature-regulating.',3999,'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=600&q=80', 'apparel',      'Sale', 4.9),
  ('Walnut Desk Organiser',      'Solid walnut with felt-lined compartments. Clears the chaos.',    1649, 'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=600&q=80', 'lifestyle',    NULL,   4.6),
  ('Hand-turned Brass Pen',      'CNC-machined from solid brass. Gets better with age.',            1299, 'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=600&q=80', 'accessories',  'New',  4.9),
  ('Organic Cotton Shirt',       'GOTS-certified organic cotton. Relaxed fit, refined drape.',      2299, 'https://images.unsplash.com/photo-1586790170083-2f9ceadc732d?w=600&q=80', 'apparel',      NULL,   4.5),
  ('Stone-ground Coffee Blend',  'Single-origin beans, medium roast. Notes of dark chocolate.',      899, 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&q=80', 'lifestyle',    'New',  4.8),
  ('Minimalist Card Wallet',     'Full-grain veg-tanned leather. Holds 6 cards, slim as 4mm.',      1099, 'https://images.unsplash.com/photo-1627123424574-724758594785?w=600&q=80', 'accessories',  NULL,   4.7)
ON CONFLICT DO NOTHING;


-- ── 4. ORDERS TABLE ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email     TEXT NOT NULL,
  payment_id     TEXT,          -- Razorpay payment_id
  order_id       TEXT,          -- Razorpay order_id (server-generated)
  amount         NUMERIC(10, 2) NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'INR',
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  items          JSONB NOT NULL  -- snapshot of cart items at time of purchase
);


-- ── 5. ROW LEVEL SECURITY ─────────────────────────────────

-- ── profiles ──
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"  ON public.profiles;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- ── products ──
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_public_read" ON public.products;

-- Everyone (including anonymous visitors) can read active products
CREATE POLICY "products_public_read"
  ON public.products FOR SELECT
  USING (is_active = TRUE);

-- ── orders ──
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_insert_auth"   ON public.orders;
DROP POLICY IF EXISTS "orders_select_own"    ON public.orders;

-- Only authenticated users can place orders
CREATE POLICY "orders_insert_auth"
  ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only read their own orders
CREATE POLICY "orders_select_own"
  ON public.orders FOR SELECT
  USING (auth.uid() = user_id);


-- ── 6. INDEXES ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_category  ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_orders_user_id     ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status      ON public.orders(status);


-- ============================================================
--  Done! You should now have:
--    public.profiles  — auto-populated on signup
--    public.products  — 8 seed products
--    public.orders    — ready for Razorpay payments
--  with RLS policies enforced on all tables.
-- ============================================================
