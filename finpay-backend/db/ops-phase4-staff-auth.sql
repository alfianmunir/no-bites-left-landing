-- Ops ERP Phase 4 (Staff accounts / RBAC) — a second login role.
--
-- Adds password-based staff logins on ops.staff (super-admin sets them from the
-- Team tab; scrypt hash stored in password_hash, can_login gates it) and tags
-- production batches with who started them (created_by_staff; NULL = super-admin).
-- Cycle start/close RPCs are extended so a staff member can open a batch WITHOUT
-- entering labor, and the super-admin supplies labor when closing it.
--
-- Apply to the live `ops` schema (project ticdiatbdxkmpzmqvntn) BEFORE deploying
-- the matching code (the app reads staff.can_login and batches.created_by_staff,
-- and calls the new RPC signatures). Idempotent: ALTER ... IF NOT EXISTS /
-- DROP + CREATE. Builds on db/ops-phase3-batch-cycles.sql.

-- 1. Staff logins.
alter table ops.staff add column if not exists password_hash text;
alter table ops.staff add column if not exists can_login boolean not null default false;

-- 2. Batch ownership (NULL = super-admin/admin console).
alter table ops.production_batches add column if not exists created_by_staff uuid references ops.staff(id);

-- 3. start_batch_cycle: + p_created_by, and labor_cost may be NULL (staff open a
--    batch without labor; the super-admin fills it in at close). Drop the phase-3
--    signature first so we replace rather than overload.
drop function if exists ops.start_batch_cycle(jsonb, numeric, integer);
create or replace function ops.start_batch_cycle(
  p_lines jsonb,
  p_labor_cost numeric,
  p_labor_minutes integer default null,
  p_created_by uuid default null
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
  if p_labor_cost is not null and p_labor_cost < 0 then raise exception 'labor_cost must be >= 0'; end if;

  -- labor_cost stays NULL when the opener didn't set it — the close step then
  -- knows to collect it (and the UI shows a labor input for such batches).
  insert into production_batches (status, is_cycle, disposition, planned_qty, labor_cost, labor_minutes, created_by_staff)
    values ('in_progress', true, 'sale', null, p_labor_cost, p_labor_minutes, p_created_by)
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

-- 4. close_batch_cycle: + p_labor_cost. When the batch was opened without labor
--    (staff-started), the super-admin passes it here; otherwise the header value
--    is used. Drop the phase-3 signature first.
drop function if exists ops.close_batch_cycle(uuid, jsonb);
create or replace function ops.close_batch_cycle(
  p_batch_id uuid,
  p_yields jsonb,
  p_labor_cost numeric default null
) returns numeric
language plpgsql
set search_path to 'ops'
as $$
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
