-- Ops ERP Phase 5 (Order fulfillment + payment tracking) — OMS lifecycle.
--
-- Adds a kitchen fulfillment lifecycle (preparing → packed → in_delivery →
-- delivered) and a payment status (unpaid | paid) to ops.sales_orders, plus a
-- "canteen" channel whose orders are born delivered + paid. The existing
-- `status` column (confirmed/fulfilled/cancelled/refunded) is left untouched —
-- these are new, separate columns.
--
-- Apply to the live `ops` schema (project ticdiatbdxkmpzmqvntn) BEFORE deploying
-- the matching code (listSalesOrders/createSalesOrder read/write these columns).
-- Idempotent: ADD COLUMN IF NOT EXISTS + guarded constraint/seed. Builds on M3 OMS.

-- 1. Fulfillment + payment columns.
alter table ops.sales_orders add column if not exists fulfillment_status text not null default 'preparing';
alter table ops.sales_orders add column if not exists payment_status text not null default 'unpaid';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_orders_fulfillment_status_check') then
    alter table ops.sales_orders add constraint sales_orders_fulfillment_status_check
      check (fulfillment_status in ('preparing','packed','in_delivery','delivered'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sales_orders_payment_status_check') then
    alter table ops.sales_orders add constraint sales_orders_payment_status_check
      check (payment_status in ('unpaid','paid'));
  end if;
end $$;

create index if not exists sales_orders_fulfillment_idx on ops.sales_orders(fulfillment_status);

-- 2. Backfill existing (pre-feature) orders. They're historical, so mark them
--    delivered so they don't clog the "to prepare" list; payment is derived from
--    how each channel settles (direct/marketplace = cash at sale; b2b = its
--    invoice; website = unpaid until the PG webhook lands).
update ops.sales_orders set fulfillment_status = 'delivered' where fulfillment_status = 'preparing';

update ops.sales_orders so set payment_status = sub.pay
from (
  select o.id,
         case
           when c.name in ('direct','gofood','grabfood','shopeefood') then 'paid'
           when c.name = 'b2b' and exists (select 1 from ops.invoices i where i.sales_order_id = o.id and i.status = 'paid') then 'paid'
           else 'unpaid'
         end as pay
  from ops.sales_orders o join ops.channels c on c.id = o.channel_id
) sub
where sub.id = so.id;

-- 3. Canteen channel — internal cash sales, born paid + delivered. No fee.
insert into ops.channels (name, fee_pct, fee_flat, settlement_lag_days, price_multiplier, active, note)
select 'canteen', 0, 0, 0, 1.0, true, 'Internal canteen — cash, delivered on sale'
where not exists (select 1 from ops.channels where name = 'canteen');
