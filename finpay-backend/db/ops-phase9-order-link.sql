-- Ops ERP Phase 9 (Website ↔ ops finance link — DB-level integrity guardrails).
--
-- Until now the only thing tying a website order (public.orders) to its finance
-- mirror (ops.sales_orders) was the app-side `source_order_id` column plus a racy
-- `NOT EXISTS` check in syncWebsiteOrders(). This migration moves the integrity
-- guarantees that Postgres does better than app code into the database itself:
--
--   1. UNIQUE(source_order_id) — makes a double-mirror physically impossible, so
--      the webhook (real-time) and the reconcile sweep (backstop) can both run
--      without racing. Lets the app use `ON CONFLICT DO NOTHING`.
--   2. FK source_order_id → public.orders(id) — referential integrity; a mirror
--      can't point at a non-existent order, and a booked order can't be deleted
--      out from under the ledger. Wrapped so it degrades gracefully if the apply
--      role lacks REFERENCES on public.orders (cross-schema privilege).
--   3. ops.v_website_order_drift — a queryable "paid website orders with no
--      finance mirror" view, so drift becomes a metric the dashboard can alarm on
--      instead of an invisible gap.
--
-- Both columns are text and there are no existing duplicate source_order_id
-- values (verified pre-apply). Apply to the live `ops` schema. Idempotent.

-- 1. Uniqueness on the link. Partial (WHERE NOT NULL) so the many rows with a
--    NULL source_order_id (direct/b2b/canteen orders) don't collide.
create unique index if not exists sales_orders_source_order_id_uq
  on ops.sales_orders (source_order_id)
  where source_order_id is not null;

-- 2. Referential integrity to the storefront order. RESTRICT: a website order
--    that has been booked into finance must not be hard-deleted (cancel/refund is
--    a status change, not a delete).
--
--    Added NOT VALID: at least one legacy mirror (sales_order 048f9b2e…, source
--    NBL-THWQH9-6Z8G, a paid test order whose public.orders row was later removed)
--    references a row that no longer exists, so a validating ADD fails. NOT VALID
--    enforces the FK for every NEW/updated mirror while grandfathering the legacy
--    orphan(s). Once those are resolved, run:
--        alter table ops.sales_orders validate constraint sales_orders_source_order_fk;
--    Still guarded so a role without REFERENCES on public.orders degrades to the
--    unique index alone rather than failing the whole migration.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'ops'
      and table_name = 'sales_orders'
      and constraint_name = 'sales_orders_source_order_fk'
  ) then
    begin
      alter table ops.sales_orders
        add constraint sales_orders_source_order_fk
        foreign key (source_order_id) references public.orders(id)
        on delete restrict
        not valid;
    exception
      when insufficient_privilege then
        raise notice 'phase9: FK to public.orders skipped (no REFERENCES privilege); unique index still enforced';
      when others then
        raise notice 'phase9: FK to public.orders skipped (%): %', sqlstate, sqlerrm;
    end;
  end if;
end $$;

-- 3. Drift view — paid-or-beyond website orders with no ops finance mirror yet.
--    With the resilient webhook + sweep this should stay empty; a non-empty row
--    means a paid order's revenue hasn't reached the ledger (webhook missed and
--    no reconcile sweep has run since). Surfaced as a Today-dashboard guardrail.
create or replace view ops.v_website_order_drift as
select
  o.id                                             as order_id,
  o.status,
  o.amount,
  o.created_at,
  o.pickup_date,
  coalesce(nullif(o.customer->>'firstName', ''), 'Website') as customer_name
from public.orders o
where o.status in ('PAID', 'BAKING', 'READY_FOR_PICKUP', 'PICKED_UP')
  and not exists (
    select 1 from ops.sales_orders so where so.source_order_id = o.id
  );

-- 4. Validate the FK. On the live DB the one legacy orphan (NBL-THWQH9-6Z8G) was
--    cleaned up, so the FK was validated in place. Guarded so a re-run — or a
--    fresh apply with no orphans — validates cleanly, and any (unexpected) orphan
--    just leaves the FK NOT VALID (still enforcing new rows) rather than failing.
do $$
begin
  begin
    alter table ops.sales_orders validate constraint sales_orders_source_order_fk;
  exception
    when others then
      raise notice 'phase9: FK validate skipped (%): %', sqlstate, sqlerrm;
  end;
end $$;
