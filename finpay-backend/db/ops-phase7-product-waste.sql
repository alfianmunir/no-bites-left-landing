-- Ops ERP Phase 7 (Per-product waste rate) — menu-level waste override.
--
-- Waste rate was a single general config (ops.config 'waste_rate'). This adds an
-- optional per-product override on ops.products.waste_rate (NULL = inherit the
-- general rate). Pricing uses product override ?? general. No data change to
-- existing products (all inherit until an override is set).
--
-- Apply to the live `ops` schema before deploying the code. Idempotent.

alter table ops.products add column if not exists waste_rate numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_waste_rate_check') then
    alter table ops.products add constraint products_waste_rate_check
      check (waste_rate is null or (waste_rate >= 0 and waste_rate < 1));
  end if;
end $$;
