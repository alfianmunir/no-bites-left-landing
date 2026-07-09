-- Ops ERP Phase 10 — data backfill: migrate public.orders -> ops.sales_orders.
-- Run AFTER ops-phase10-native-orders.sql. Idempotent (safe to re-run).
--
-- Two parts:
--   (A) UPGRADE the existing phase-B/9 mirror rows (source_order_id set) to
--       native — fill order_no + all the customer/items/payment/lifecycle fields
--       from the matching public.orders. No new finance rows (their sales_lines /
--       stock / cash already exist from the mirror).
--   (B) INSERT any public.orders that has no sales_orders yet (unpaid / pending /
--       cancelled / expired never-mirrored orders). These have no finance effect
--       so no sales_lines/stock/cash are created — correct, they were never paid.
--
-- Status mapping (public single-axis -> ops three-axis):
--   PENDING           -> unpaid  / pending    / (fulfillment n/a: preparing)
--   PAID, BAKING      -> paid    / confirmed   / preparing
--   READY_FOR_PICKUP  -> paid    / confirmed   / ready_for_pickup   (+ready_at)
--   PICKED_UP         -> paid    / fulfilled   / picked_up          (+fulfilled_at)
--   EXPIRED           -> unpaid  / expired     / preparing
--   CANCELLED         -> unpaid  / cancelled   / preparing
--   REFUNDED          -> paid    / refunded    / preparing

-- (A) upgrade existing mirror rows
update ops.sales_orders so set
  order_no         = o.id,
  customer         = o.customer,
  customer_ref     = coalesce(nullif(o.customer->>'firstName',''), so.customer_ref, 'Website'),
  user_id          = o.user_id,
  items            = o.items,
  amount           = o.amount,
  pickup_date      = o.pickup_date,
  fulfillment      = coalesce(o.fulfillment, 'PICKUP'),
  finpay_reference = o.finpay_reference,
  redirect_url     = o.redirect_url,
  expiry_link      = o.expiry_link,
  callback_log     = coalesce(o.callback_log, '[]'::jsonb),
  status_history   = coalesce(o.status_history, '[]'::jsonb),
  ordered_at       = o.created_at,
  updated_at       = o.updated_at,
  payment_status   = case when o.status in ('PAID','BAKING','READY_FOR_PICKUP','PICKED_UP','REFUNDED') then 'paid' else 'unpaid' end,
  status           = case o.status
                        when 'PENDING'   then 'pending'
                        when 'EXPIRED'   then 'expired'
                        when 'CANCELLED' then 'cancelled'
                        when 'REFUNDED'  then 'refunded'
                        when 'PICKED_UP' then 'fulfilled'
                        else 'confirmed' end,
  fulfillment_status = case o.status
                        when 'READY_FOR_PICKUP' then 'ready_for_pickup'
                        when 'PICKED_UP'        then 'picked_up'
                        else so.fulfillment_status end,   -- keep preparing/packed set by ops
  paid_at          = case when o.status in ('PAID','BAKING','READY_FOR_PICKUP','PICKED_UP','REFUNDED') then o.updated_at else null end,
  ready_at         = case when o.status = 'READY_FOR_PICKUP' then o.updated_at else so.ready_at end,
  fulfilled_at     = case when o.status = 'PICKED_UP' then coalesce(so.fulfilled_at, o.updated_at) else so.fulfilled_at end
from public.orders o
where so.source_order_id = o.id;

-- (B) insert never-mirrored public.orders as native rows
insert into ops.sales_orders (
  channel_id, order_no, source_order_id, customer, customer_ref, user_id, items, amount,
  pickup_date, fulfillment, finpay_reference, redirect_url, expiry_link, callback_log, status_history,
  ordered_at, updated_at, payment_status, status, fulfillment_status, paid_at, ready_at, fulfilled_at)
select
  (select id from ops.channels where name = 'website'),
  o.id, null, o.customer, coalesce(nullif(o.customer->>'firstName',''), 'Website'), o.user_id, o.items, o.amount,
  o.pickup_date, coalesce(o.fulfillment,'PICKUP'), o.finpay_reference, o.redirect_url, o.expiry_link,
  coalesce(o.callback_log,'[]'::jsonb), coalesce(o.status_history,'[]'::jsonb),
  o.created_at, o.updated_at,
  case when o.status in ('PAID','BAKING','READY_FOR_PICKUP','PICKED_UP','REFUNDED') then 'paid' else 'unpaid' end,
  case o.status
    when 'PENDING'   then 'pending'
    when 'EXPIRED'   then 'expired'
    when 'CANCELLED' then 'cancelled'
    when 'REFUNDED'  then 'refunded'
    when 'PICKED_UP' then 'fulfilled'
    else 'confirmed' end,
  case o.status
    when 'READY_FOR_PICKUP' then 'ready_for_pickup'
    when 'PICKED_UP'        then 'picked_up'
    else 'preparing' end,
  case when o.status in ('PAID','BAKING','READY_FOR_PICKUP','PICKED_UP','REFUNDED') then o.updated_at else null end,
  case when o.status = 'READY_FOR_PICKUP' then o.updated_at else null end,
  case when o.status = 'PICKED_UP' then o.updated_at else null end
from public.orders o
where not exists (
  select 1 from ops.sales_orders so where so.source_order_id = o.id or so.order_no = o.id
);
