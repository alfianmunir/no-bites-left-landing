-- Ops ERP Phase 8 (Website → ops: menu mapping) — foundation.
--
-- The storefront menu (public.menu_items, variant-level SKUs like og-40/og-100)
-- doesn't line up 1:1 with ops.products. This map lets an admin link each
-- storefront SKU to an ops product plus a quantity multiplier (e.g. a 100g item
-- draws more product than a 40g one). Phase B (create ops sales order on paid)
-- will read this map to draw down finished goods + book COGS for website sales.
--
-- Apply to the live `ops` schema. Idempotent.

create table if not exists ops.menu_product_map (
  menu_sku   text primary key,
  product_id uuid not null references ops.products(id),
  qty_per    numeric not null default 1 check (qty_per > 0),
  updated_at timestamptz not null default now()
);
