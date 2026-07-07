-- Ops ERP Phase 2 (M2 Production & costing) — new RPCs.
--
-- Applied to the live `ops` schema (project ticdiatbdxkmpzmqvntn). Kept here in
-- the repo for record; the ops schema itself was created via Supabase
-- migrations outside this repo (Phase 0/1). CREATE OR REPLACE is idempotent and
-- reversible (DROP FUNCTION), and touches no data.
--
-- Conventions honoured (HANDOFF §2): ledgers are append-only (we only INSERT
-- stock_moves via consume_fefo + the finished-goods output move); costs are
-- computed from ledger rows + config, never typed — except labor, which is a
-- deliberate per-batch input at close (operator enters this batch's share of
-- the day's labor pay; decided 7 Jul 2026).

-- start_batch: open a production batch and consume its scaled BOM (FEFO).
--   planned_qty is the number of finished units planned; the BOM (per full
--   recipe batch that yields batch_yield_qty) is scaled by planned_qty/yield.
create or replace function ops.start_batch(
  p_recipe_id uuid,
  p_planned_qty numeric,
  p_disposition text default 'sale'
) returns uuid
language plpgsql
set search_path to 'ops'
as $$
declare v_batch uuid; v_yield numeric; v_scale numeric; l record;
begin
  if p_planned_qty is null or p_planned_qty <= 0 then
    raise exception 'planned_qty must be > 0';
  end if;
  if coalesce(p_disposition,'sale') not in ('sale','sample') then
    raise exception 'disposition must be sale or sample';
  end if;
  select batch_yield_qty into v_yield from recipes where id = p_recipe_id and active;
  if v_yield is null then
    raise exception 'recipe % not found or inactive', p_recipe_id;
  end if;
  v_scale := p_planned_qty / v_yield;

  insert into production_batches (recipe_id, planned_qty, status, disposition)
    values (p_recipe_id, p_planned_qty, 'in_progress', coalesce(p_disposition,'sale'))
    returning id into v_batch;

  -- Consume each BOM line, scaled to the planned qty, earliest-expiry-first.
  -- consume_fefo tolerates pre-system stock (posts a no-lot move at avg cost),
  -- so a batch is never blocked; the UI surfaces shortfalls before start.
  for l in select item_id, qty_per_batch from recipe_lines where recipe_id = p_recipe_id loop
    perform consume_fefo(
      l.item_id,
      round(l.qty_per_batch * v_scale, 4),
      'production_consume',
      'production_batch',
      v_batch,
      null
    );
  end loop;

  return v_batch;
end $$;

-- close_batch: finalise a batch — compute its cost from the ledger + inputs,
--   post finished goods, and roll the product's std_cost.
--   labor_cost is a per-batch operator input (decided); labor_minutes is kept
--   for record/yield-bonus use later (Phase 5).
create or replace function ops.close_batch(
  p_batch_id uuid,
  p_actual_yield numeric,
  p_labor_minutes integer,
  p_labor_cost numeric
) returns numeric
language plpgsql
set search_path to 'ops'
as $$
declare
  v_recipe uuid; v_product uuid; v_status text; v_disposition text;
  v_ingredient numeric; v_packaging numeric; v_material numeric;
  v_overhead_rate numeric; v_overhead numeric; v_labor numeric;
  v_total numeric; v_cpu numeric; v_avg numeric;
begin
  select recipe_id, status, disposition
    into v_recipe, v_status, v_disposition
    from production_batches where id = p_batch_id;
  if v_recipe is null then raise exception 'batch % not found', p_batch_id; end if;
  if v_status = 'closed' then raise exception 'batch % already closed', p_batch_id; end if;
  if v_status = 'cancelled' then raise exception 'batch % is cancelled', p_batch_id; end if;
  if p_actual_yield is null or p_actual_yield <= 0 then raise exception 'actual_yield must be > 0'; end if;
  v_labor := coalesce(p_labor_cost, 0);
  if v_labor < 0 then raise exception 'labor_cost must be >= 0'; end if;

  select product_id into v_product from recipes where id = v_recipe;

  -- Material cost straight from the batch's consume moves, split by item type.
  select
    coalesce(sum(case when i.type = 'ingredient' then -m.qty * m.unit_cost else 0 end), 0),
    coalesce(sum(case when i.type = 'packaging'  then -m.qty * m.unit_cost else 0 end), 0)
    into v_ingredient, v_packaging
    from stock_moves m
    join items i on i.id = m.item_id
   where m.ref_type = 'production_batch'
     and m.ref_id = p_batch_id
     and m.reason = 'production_consume';
  v_material := v_ingredient + v_packaging;

  select (value #>> '{}')::numeric into v_overhead_rate from config where key = 'overhead_rate';
  v_overhead_rate := coalesce(v_overhead_rate, 0.20);
  v_overhead := round(v_material * v_overhead_rate, 2);

  v_total := v_material + v_labor + v_overhead;
  v_cpu := round(v_total / p_actual_yield, 4);

  insert into batch_costs (batch_id, ingredient_cost, packaging_cost, labor_cost, overhead_cost, cost_per_unit)
    values (p_batch_id, round(v_ingredient, 2), round(v_packaging, 2), round(v_labor, 2), v_overhead, v_cpu);

  -- Finished-goods output move (samples don't add sellable stock; their cost is
  -- carried by the batch and reclassified to marketing in Phase 4).
  if coalesce(v_disposition, 'sale') <> 'sample' then
    insert into stock_moves (product_id, qty, reason, ref_type, ref_id, unit_cost)
      values (v_product, p_actual_yield, 'production_output', 'production_batch', p_batch_id, v_cpu);
  end if;

  update production_batches
     set status = 'closed', actual_yield = p_actual_yield, labor_minutes = p_labor_minutes, baked_at = current_date
   where id = p_batch_id;

  -- Roll std_cost to the trailing 3-batch average cost/unit for this product.
  select avg(cpu) into v_avg from (
    select bc.cost_per_unit cpu
      from batch_costs bc
      join production_batches pb on pb.id = bc.batch_id
      join recipes r on r.id = pb.recipe_id
     where r.product_id = v_product and pb.status = 'closed' and bc.cost_per_unit is not null
     order by bc.computed_at desc
     limit 3
  ) t;
  if v_avg is not null then
    update products set std_cost = round(v_avg, 4) where id = v_product;
  end if;

  return v_cpu;
end $$;
