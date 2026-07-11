-- Ops ERP Phase 12 (Audit H4) — populate ops.batch_costs from cycle closes.
--
-- Problem (audit §H4): batch_costs is empty because the modern multi-recipe
-- close_batch_cycle writes per-line costs to ops.batch_lines and rolls
-- products.std_cost from there — but never wrote the legacy per-batch
-- ops.batch_costs record. So there was no persistent batch-level cost history,
-- and std_cost had no visible provenance.
--
-- Fix: close_batch_cycle now ALSO writes one ops.batch_costs rollup row per
-- closed cycle (material/labor/overhead totals summed from its batch_lines).
-- We keep the existing schema — batch_costs' PRIMARY KEY is (batch_id), one row
-- per batch — rather than doing PK surgery on prod for a per-line grain that
-- batch_lines already provides. cost_per_unit is set only for single-product
-- cycles (a blended per-unit across brownies + cookies would be meaningless);
-- per-product unit costs live on batch_lines, surfaced by ops.v_product_costing.
--
-- Apply to the live `ops` schema (project ticdiatbdxkmpzmqvntn). Idempotent:
-- CREATE OR REPLACE; the INSERT is ON CONFLICT (batch_id) DO NOTHING and a
-- re-close is already blocked (status='closed' raises). Ledgers stay
-- append-only. The body below is the live phase-4 definition + the one added
-- INSERT block near the end — nothing else changed.

create or replace function ops.close_batch_cycle(p_batch_id uuid, p_yields jsonb, p_labor_cost numeric default null::numeric)
 returns numeric
 language plpgsql
 set search_path to 'ops'
as $function$
declare
  v_status text; v_labor numeric; v_overhead_rate numeric;
  v_total_material numeric; v_line_count int; v_batch_total numeric := 0;
  y jsonb; r record; p record; v_avg numeric;
begin
  select status, labor_cost into v_status, v_labor
    from production_batches where id = p_batch_id and is_cycle;
  if v_status is null then raise exception 'cycle batch % not found', p_batch_id; end if;
  if v_status = 'closed' then raise exception 'batch % already closed', p_batch_id; end if;
  if v_status = 'cancelled' then raise exception 'batch % is cancelled', p_batch_id; end if;

  -- Labor: caller-supplied wins, else the value set at open, else 0.
  v_labor := coalesce(p_labor_cost, v_labor, 0);
  if v_labor < 0 then raise exception 'labor_cost must be >= 0'; end if;

  for y in select value from jsonb_array_elements(p_yields) loop
    if (y->>'actual_yield')::numeric is null or (y->>'actual_yield')::numeric <= 0 then
      raise exception 'each line needs actual_yield > 0';
    end if;
    update batch_lines set actual_yield = (y->>'actual_yield')::numeric
     where id = (y->>'line_id')::uuid and batch_id = p_batch_id;
  end loop;
  if exists (select 1 from batch_lines where batch_id = p_batch_id and actual_yield is null) then
    raise exception 'enter actual yield for every line';
  end if;

  select (value #>> '{}')::numeric into v_overhead_rate from config where key = 'overhead_rate';
  v_overhead_rate := coalesce(v_overhead_rate, 0.20);

  select count(*) into v_line_count from batch_lines where batch_id = p_batch_id;
  select coalesce(sum(-m.qty * m.unit_cost), 0) into v_total_material
    from stock_moves m
    join batch_lines bl on bl.id = m.ref_id
   where m.ref_type = 'batch_line' and m.reason = 'production_consume' and bl.batch_id = p_batch_id;

  for r in select * from batch_lines where batch_id = p_batch_id loop
    declare
      v_ing numeric; v_pack numeric; v_mat numeric;
      v_line_labor numeric; v_ovh numeric; v_line_total numeric; v_cpu numeric; v_sellable numeric;
    begin
      select
        coalesce(sum(case when i.type = 'ingredient' then -m.qty * m.unit_cost else 0 end), 0),
        coalesce(sum(case when i.type = 'packaging'  then -m.qty * m.unit_cost else 0 end), 0)
        into v_ing, v_pack
        from stock_moves m join items i on i.id = m.item_id
       where m.ref_type = 'batch_line' and m.ref_id = r.id and m.reason = 'production_consume';
      v_mat := v_ing + v_pack;

      if v_total_material > 0 then
        v_line_labor := round(v_labor * (v_mat / v_total_material), 2);
      else
        v_line_labor := round(v_labor / greatest(v_line_count, 1), 2);
      end if;
      v_ovh := round(v_mat * v_overhead_rate, 2);
      v_line_total := v_mat + v_line_labor + v_ovh;
      v_cpu := round(v_line_total / r.actual_yield, 4);

      update batch_lines
         set ingredient_cost = round(v_ing, 2), packaging_cost = round(v_pack, 2),
             labor_cost = v_line_labor, overhead_cost = v_ovh, cost_per_unit = v_cpu
       where id = r.id;

      v_sellable := r.actual_yield - (coalesce(r.qty_sample, 0) + coalesce(r.qty_kol, 0) + coalesce(r.qty_rnd, 0));
      if v_sellable < 0 then v_sellable := 0; end if;
      if v_sellable > 0 then
        insert into stock_moves (product_id, qty, reason, ref_type, ref_id, unit_cost)
          values (r.product_id, v_sellable, 'production_output', 'batch_line', r.id, v_cpu);
      end if;

      v_batch_total := v_batch_total + v_line_total;
    end;
  end loop;

  update production_batches
     set status = 'closed', baked_at = current_date, labor_cost = v_labor,
         planned_qty  = (select sum(planned_qty)  from batch_lines where batch_id = p_batch_id),
         actual_yield = (select sum(actual_yield) from batch_lines where batch_id = p_batch_id)
   where id = p_batch_id;

  -- NEW (Phase 12 / H4): persist a per-batch cost rollup so batch_costs is no
  -- longer empty and every std_cost update has a traceable bake behind it.
  -- Totals sum the just-costed batch_lines; cost_per_unit is only meaningful for
  -- a single-product cycle (else NULL — the per-product cpu is on batch_lines).
  insert into batch_costs (batch_id, ingredient_cost, packaging_cost, labor_cost, overhead_cost, cost_per_unit, computed_at)
  select p_batch_id,
         coalesce(sum(ingredient_cost), 0),
         coalesce(sum(packaging_cost), 0),
         coalesce(sum(labor_cost), 0),
         coalesce(sum(overhead_cost), 0),
         case when count(distinct product_id) = 1
              then round(sum(ingredient_cost + packaging_cost + labor_cost + overhead_cost) / nullif(sum(actual_yield), 0), 4)
              else null end,
         now()
    from batch_lines
   where batch_id = p_batch_id
  on conflict (batch_id) do nothing;

  for p in select distinct product_id from batch_lines where batch_id = p_batch_id loop
    select avg(cpu) into v_avg from (
      select bl.cost_per_unit cpu
        from batch_lines bl
        join production_batches pb on pb.id = bl.batch_id
       where bl.product_id = p.product_id and pb.status = 'closed' and bl.cost_per_unit is not null
       order by bl.created_at desc
       limit 3
    ) t;
    if v_avg is not null then
      update products set std_cost = round(v_avg, 4) where id = p.product_id;
    end if;
  end loop;

  return v_batch_total;
end $function$;

-- Per-product costing provenance (read model for the Pricing "cost provenance"
-- panel + the margin-floor guardrail). One row per product: current std_cost,
-- the most recent bake's per-unit cost + date, the trailing-3-bake average
-- (exactly what close_batch_cycle rolls std_cost to), and how many bakes back
-- it. `bakes = 0` ⇒ std_cost is still the Notion seed (never baked in-system).
create or replace view ops.v_product_costing as
with lines as (
  select bl.product_id, bl.cost_per_unit, bl.created_at,
         row_number() over (partition by bl.product_id order by bl.created_at desc) rn
    from ops.batch_lines bl
    join ops.production_batches pb on pb.id = bl.batch_id
   where pb.status = 'closed' and bl.cost_per_unit is not null
)
select p.id as product_id, p.sku, p.name, p.std_cost,
       (select cost_per_unit from lines where product_id = p.id and rn = 1) as last_bake_cost,
       (select created_at   from lines where product_id = p.id and rn = 1) as last_bake_at,
       (select round(avg(cost_per_unit), 4) from lines where product_id = p.id and rn <= 3) as trailing3_avg,
       (select count(*) from lines where product_id = p.id) as bakes
  from ops.products p
 order by p.sku;
