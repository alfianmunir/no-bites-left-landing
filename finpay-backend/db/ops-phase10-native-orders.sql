-- Ops ERP Phase 10 — ops.sales_orders becomes the NATIVE primary store for the
-- whole website order lifecycle. public.orders is retired: the storefront now
-- creates its order directly in sales_orders (unpaid at checkout), the Finpay
-- webhook realizes it on payment, and the consumer + ops surfaces all read
-- sales_orders. This migration only widens the table + relaxes the CHECKs; the
-- app refactor + data backfill are separate steps.
--
-- Apply to the live `ops` schema. Idempotent.

-- 0. Drop the phase-9 FK to public.orders — that table is being retired, so a
--    native sales_order must not be forced to reference it. The partial-unique
--    index on source_order_id is kept (harmless; native rows leave it NULL) so
--    the transition period can't double-mirror a legacy order.
alter table ops.sales_orders drop constraint if exists sales_orders_source_order_fk;

-- 1. Native website columns (all additive; existing rows get NULL/defaults).
--    `items` (jsonb) is the display/consumer truth and covers unmapped SKUs;
--    ops.sales_lines stays the finance truth (mapped products, COGS/margin),
--    created when the order is paid.
alter table ops.sales_orders
  add column if not exists order_no         text,          -- consumer number NBL-… (website); NULL for other channels
  add column if not exists customer         jsonb,         -- {email, firstName, lastName, mobilePhone}
  add column if not exists user_id          text,          -- Supabase auth id -> "My Orders"
  add column if not exists items            jsonb,         -- [{sku,name,qty,unit_price}] display truth
  add column if not exists amount           integer,       -- authoritative IDR total (customer-facing)
  add column if not exists pickup_date      date,
  add column if not exists fulfillment      text not null default 'PICKUP',  -- PICKUP | DELIVERY (delivery dormant)
  add column if not exists finpay_reference text,
  add column if not exists redirect_url     text,          -- Finpay hosted-payment link (pending "pay now")
  add column if not exists expiry_link      timestamptz,
  add column if not exists callback_log     jsonb not null default '[]'::jsonb,  -- verified Finpay callbacks
  add column if not exists paid_at          timestamptz,
  add column if not exists packed_at        timestamptz,
  add column if not exists ready_at         timestamptz,   -- ready_for_pickup stamp
  add column if not exists status_history   jsonb not null default '[]'::jsonb,  -- [{status, at, by}]
  add column if not exists updated_at       timestamptz not null default now();

-- 2. Extend the lifecycle CHECKs.
--    fulfillment_status: website adds ready_for_pickup + picked_up; other
--    channels keep preparing/packed/in_delivery/delivered.
alter table ops.sales_orders drop constraint if exists sales_orders_fulfillment_status_check;
alter table ops.sales_orders add constraint sales_orders_fulfillment_status_check
  check (fulfillment_status in ('preparing','packed','ready_for_pickup','picked_up','in_delivery','delivered'));

--    status: adds pending (unpaid at checkout) + expired (payment lapsed).
alter table ops.sales_orders drop constraint if exists sales_orders_status_check;
alter table ops.sales_orders add constraint sales_orders_status_check
  check (status in ('pending','confirmed','fulfilled','cancelled','refunded','expired'));

-- 3. Indexes for the native website workload.
create unique index if not exists sales_orders_order_no_uq on ops.sales_orders(order_no) where order_no is not null;
create index if not exists sales_orders_user_id_idx        on ops.sales_orders(user_id);
create index if not exists sales_orders_pickup_date_idx    on ops.sales_orders(pickup_date);
create index if not exists sales_orders_payment_status_idx on ops.sales_orders(payment_status);
