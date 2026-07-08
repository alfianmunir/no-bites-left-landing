-- Ops ERP Phase 3 (M2b Production cycles) — multi-recipe batches.
--
-- A production run is now a *cycle*: one batch holds many recipe lines, each
-- with its own planned units and a per-line allocation split across
-- for-sale / sample / KOL / R&D. Labor is entered once for the whole cycle and
-- split across lines by material-cost share. Stock is consumed when the cycle
-- is started (the draft lives client-side until then); each line is closed with
-- its actual yield and only the for-sale portion posts sellable finished goods.
--
-- Apply to the live `ops` schema (project ticdiatbdxkmpzmqvntn). Idempotent:
-- ALTER ... IF (NOT) EXISTS / CREATE OR REPLACE. Legacy single-recipe batches
-- (is_cycle = false) keep working via the original start_batch/close_batch.
--
-- Conventions honoured (HANDOFF §2): ledgers stay append-only (consume_fefo +
-- the finished-goods output move); costs are computed from ledger rows + config,
-- never typed — except labor, a deliberate per-cycle operator input.

-- 1. Header: production_batches becomes a cycle header. recipe_id/planned_qty go
--    nullable (a cycle's recipes live in batch_lines); labor_cost + is_cycle add.
alter table ops.production_batches add column if not exists labor_cost numeric;
alter table ops.production_batches add column if not exists is_cycle boolean not null default false;
alter table ops.production_batches alter column recipe_id drop not null;
alter table ops.production_batches alter column planned_qty drop not null;

-- 2. Lines: one row per recipe in a cycle, with the allocation split + per-line
--    cost breakdown filled in at close.
create table if not exists ops.batch_lines (
  id           uuid primary key default gen_random_uuid(),
  batch_id     uuid not null references ops.production_batches(id) on delete cascade,
  recipe_id    uuid not null references ops.recipes(id),
  product_id   uuid not null references ops.products(id),
  planned_qty  numeric not null check (planned_qty > 0),
  qty_sample   numeric not null default 0 check (qty_sample >= 0),
  qty_kol      numeric not null default 0 check (qty_kol >= 0),
  qty_rnd      numeric not null default 0 check (qty_rnd >= 0),
  actual_yield numeric,
  ingredient_cost numeric,
  packaging_cost  numeric,
  labor_cost      numeric,
  overhead_cost   numeric,
  cost_per_unit   numeric,
  created_at   timestamptz not null default now(),
  check (qty_sample + qty_kol + qty_rnd <= planned_qty)
);
create index if not exists batch_lines_batch_idx on ops.batch_lines(batch_id);
create index if not exists batch_lines_product_idx on ops.batch_lines(product_id);

-- 3. start_batch_cycle: create the header + lines and consume every line's
--    scaled BOM (FEFO), tagged to the LINE (ref_type 'batch_line') so per-line
--    costing at close reads exactly that line's material.
--    p_lines: [{recipe_id, planned_qty, qty_sample, qty_kol, qty_rnd}]
create or replace function ops.start_batch_cycle(
  p_lines jsonb,
  p_labor_cost numeric,
  p_labor_minutes integer default null
) returns uuid
language plpgsql
set search_path to 'ops'
as $$
declare
  v_batch uuid; ln jsonb; l record;
  v_recipe uuid; v_planned numeric; v_sample numeric; v_kol numeric; v_rnd numeric;
  v_yield numeric; v_product uuid; v_scale numeric; v_line uuid;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'a batch needs at least one recipe line';
  end if;
  if coalesce(p_labor_cost, 0) < 0 then raise exception 'labor_cost must be >= 0'; end if;

  -- planned_qty stays NULL on the header (the recipes live in batch_lines); a
  -- CHECK(planned_qty > 0), if present, passes on NULL rather than on 0.
  insert into production_batches (status, is_cycle, disposition, planned_qty, labor_cost, labor_minutes)
    values ('in_progress', true, 'sale', null, coalesce(p_labor_cost, 0), p_labor_minutes)
    returning id into v_batch;

  for ln in select value from jsonb_array_elements(p_lines) loop
    v_recipe  := (ln->>'recipe_id')::uuid;
    v_planned := (ln->>'planned_qty')::numeric;
    v_sample  := coalesce((ln->>'qty_sample')::numeric, 0);
    v_kol     := coalesce((ln->>'qty_kol')::numeric, 0);
    v_rnd     := coalesce((ln->>'qty_rnd')::numeric, 0);
    if v_planned is null or v_planned <= 0 then raise exception 'each line needs planned_qty > 0'; end if;
    if v_sample < 0 or v_kol < 0 or v_rnd < 0 then raise exception 'allocation units must be >= 0'; end if;
    if v_sample + v_kol + v_rnd > v_planned then
      raise exception 'sample + KOL + R&D (%) cannot exceed planned units (%)', v_sample + v_kol + v_rnd, v_planned;
    end if;

    select batch_yield_qty, product_id into v_yield, v_product from recipes where id = v_recipe and active;
    if v_yield is null then raise exception 'recipe % not found or inactive', v_recipe; end if;
    v_scale := v_planned / v_yield;

    insert into batch_lines (batch_id, recipe_id, product_id, planned_qty, qty_sample, qty_kol, qty_rnd)
      values (v_batch, v_recipe, v_product, v_planned, v_sample, v_kol, v_rnd)
      returning id into v_line;

    for l in select item_id, qty_per_batch from recipe_lines where recipe_id = v_recipe loop
      perform consume_fefo(
        l.item_id,
        round(l.qty_per_batch * v_scale, 4),
        'production_consume',
        'batch_line',
        v_line,
        null
      );
    end loop;
  end loop;

  return v_batch;
end $$;

-- 4. close_batch_cycle: apply per-line actual yields, cost each line from its
--    consume moves (labor split by material share, overhead by config rate),
--    post the for-sale portion as finished goods, and roll each product's
--    std_cost to its trailing 3-line average.
--    p_yields: [{line_id, actual_yield}]
create or replace function ops.close_batch_cycle(
  p_batch_id uuid,
  p_yields jsonb
) returns numeric
language plpgsql
set search_path to 'ops'
as $$
declare
  v_status text; v_labor numeric; v_overhead_rate numeric;
  v_total_material numeric; v_line_count int; v_batch_total numeric := 0;
  y jsonb; r record; p record; v_avg numeric;
begin
  select status, coalesce(labor_cost, 0) into v_status, v_labor
    from production_batches where id = p_batch_id and is_cycle;
  if v_status is null then raise exception 'cycle batch % not found', p_batch_id; end if;
  if v_status = 'closed' then raise exception 'batch % already closed', p_batch_id; end if;
  if v_status = 'cancelled' then raise exception 'batch % is cancelled', p_batch_id; end if;

  -- Apply the per-line yields.
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

  -- Cost + post each line.
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

      -- Labor share: by material cost when there's material to weigh by, else even.
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

      -- For-sale portion = actual yield minus the sample/KOL/R&D carve-outs.
      -- Carve-outs don't add sellable stock; their cost stays on the batch
      -- (reclassified to marketing / R&D in finance — Phase 4).
      v_sellable := r.actual_yield - (coalesce(r.qty_sample, 0) + coalesce(r.qty_kol, 0) + coalesce(r.qty_rnd, 0));
      if v_sellable < 0 then v_sellable := 0; end if;
      if v_sellable > 0 then
        insert into stock_moves (product_id, qty, reason, ref_type, ref_id, unit_cost)
          values (r.product_id, v_sellable, 'production_output', 'batch_line', r.id, v_cpu);
      end if;

      v_batch_total := v_batch_total + v_line_total;
    end;
  end loop;

  -- Roll batch totals onto the header so the payroll quality-bonus query
  -- (qualifyingBatches: planned_qty > 0 AND actual_yield/planned_qty >= 0.95)
  -- counts cycles just like legacy single-recipe batches.
  update production_batches
     set status = 'closed', baked_at = current_date,
         planned_qty  = (select sum(planned_qty)  from batch_lines where batch_id = p_batch_id),
         actual_yield = (select sum(actual_yield) from batch_lines where batch_id = p_batch_id)
   where id = p_batch_id;

  -- Roll std_cost to the trailing 3-line average per product touched by this cycle.
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
end $$;

-- 5. cancel_batch_cycle: reverse every line's consumption (append-only opposite
--    moves) and mark cancelled. Mirrors the legacy app-side cancel for cycles.
create or replace function ops.cancel_batch_cycle(p_batch_id uuid) returns boolean
language plpgsql
set search_path to 'ops'
as $$
declare v_status text;
begin
  select status into v_status from production_batches where id = p_batch_id and is_cycle;
  if v_status is null then return false; end if;
  if v_status <> 'in_progress' then raise exception 'only in-progress batches can be cancelled'; end if;

  insert into stock_moves (item_id, qty, reason, ref_type, ref_id, unit_cost, note)
  select m.item_id, -m.qty, 'opname_adj', 'batch_cancel', m.ref_id, m.unit_cost, 'Batch cancelled — consumption reversed'
    from stock_moves m
    join batch_lines bl on bl.id = m.ref_id
   where m.ref_type = 'batch_line' and m.reason = 'production_consume' and bl.batch_id = p_batch_id;

  update production_batches set status = 'cancelled' where id = p_batch_id;
  return true;
end $$;
