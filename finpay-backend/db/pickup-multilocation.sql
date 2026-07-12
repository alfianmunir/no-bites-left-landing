-- Multi-location pickup — schema additions (v1).
-- Apply to the live Supabase project BEFORE deploying the matching code.
-- Idempotent: CREATE / ADD COLUMN IF NOT EXISTS.
--
-- NOTE (reconciled with the actual prod schema, verified 2026-07-11): the
-- storefront's order store is `ops.sales_orders` (public.orders was retired in
-- ops phase 10 — see db/ops-phase10-native-orders.sql + lib/db.ts). So the
-- per-order location column is added to ops.sales_orders here, not public.orders.
-- The catalog/settings tables live in the public schema (read by the storefront,
-- managed by admin) alongside menu_items.

-- 1. Pickup-location catalog. Admin-managed source of truth; the storefront
--    reads only active rows. `rule` is a small JSON discriminated union:
--      {"type":"weekdays"}
--      {"type":"day","day":4}                       -- 0=Sun … 6=Sat
--      {"type":"twin"}
--      {"type":"everyday"}
--      {"type":"external","shopee":"https://…","grab":"https://…"}
CREATE TABLE IF NOT EXISTS pickup_locations (
  id          TEXT PRIMARY KEY,               -- stable slug, e.g. 'paragon-c'
  name        TEXT NOT NULL,
  area        TEXT NOT NULL DEFAULT '',
  rule        JSONB NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pickup_locations_sort_idx ON pickup_locations (sort_order);

-- 2. Settings (single row) — the same-day cutoff that drives H+1 vs H+2.
CREATE TABLE IF NOT EXISTS pickup_settings (
  id                  INTEGER PRIMARY KEY DEFAULT 1,
  same_day_cutoff_wib TEXT NOT NULL DEFAULT '17:00',
  open_from_wib       TEXT NOT NULL DEFAULT '09:00',
  open_to_wib         TEXT NOT NULL DEFAULT '17:00',
  CONSTRAINT pickup_settings_singleton CHECK (id = 1)
);
INSERT INTO pickup_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 3. Which location an order is for + a denormalized {name, area} snapshot for
--    cheap display reads (status page, notify email) without a catalog lookup.
--    NULLable so existing rows (single-location era) stay valid; new PICKUP
--    orders must set them (enforced in app code).
ALTER TABLE ops.sales_orders ADD COLUMN IF NOT EXISTS pickup_location_id TEXT;
ALTER TABLE ops.sales_orders ADD COLUMN IF NOT EXISTS pickup_location    JSONB;
CREATE INDEX IF NOT EXISTS sales_orders_pickup_location_idx ON ops.sales_orders (pickup_location_id);

-- 4. Seed the five launch locations (idempotent). Edit later via the admin UI.
INSERT INTO pickup_locations (id, name, area, rule, active, sort_order) VALUES
  ('paragon-c', 'Paragon Office',        'Central · lobby reception',    '{"type":"weekdays"}',                                                                          true, 10),
  ('paragon-t', 'Paragon Office',        'Tegal · lobby reception',      '{"type":"twin"}',                                                                              true, 20),
  ('telkom',    'Telkom Landmark Tower', 'Gatot Subroto · GF concierge', '{"type":"day","day":4}',                                                                       true, 30),
  ('bakery',    'Self-pickup — Bakery',  'Kebagusan kitchen',            '{"type":"everyday"}',                                                                          true, 40),
  ('others',    'Others',                'Order via Shopee / GrabFood',  '{"type":"external","shopee":"https://shopee.co.id/nobitesleft","grab":"https://food.grab.com/id/nobitesleft"}', true, 50)
ON CONFLICT (id) DO NOTHING;
