-- Ops ERP Phase 11 (Finished-goods opname) — count products, not just items.
--
-- Opname so far covered ingredients/packaging only (ops.post_opname, which drains
-- lots FEFO on a loss). Finished goods live on the *product* side of the ledger
-- (production_output in, sales/waste out) and aren't lot-tracked, so their count
-- variance is a single signed stock_move — mirroring how sales and product waste
-- already post. Value is the moving-average made-cost of the stock on hand (so it
-- stays tied to what was produced), falling back to std_cost when there's none.
--
-- Tagged ref_type 'product_opname' so it reads distinctly from item opname
-- ('opname') and batch-cancel reversals ('batch_cancel') in the stock ledger.
--
-- Apply to the live `ops` schema. Idempotent (CREATE OR REPLACE); additive, no
-- data change to existing rows.

create or replace function ops.post_product_opname(
  p_product_id uuid,
  p_counted_qty numeric,
  p_note text default null
) returns numeric
 language plpgsql
 set search_path to 'ops'
as $function$
declare v_on_hand numeric; v_val numeric; v_diff numeric; v_cost numeric;
begin
  if p_counted_qty is null or p_counted_qty < 0 then
    raise exception 'counted_qty must be >= 0';
  end if;

  select coalesce(sum(qty), 0), coalesce(sum(qty * unit_cost), 0)
    into v_on_hand, v_val
    from stock_moves where product_id = p_product_id;

  -- Moving-average made-cost of the stock on hand; fall back to std_cost when
  -- there's none (product never produced, or fully sold down).
  if v_on_hand > 0 then
    v_cost := v_val / v_on_hand;
  else
    select std_cost into v_cost from products where id = p_product_id;
  end if;
  v_cost := coalesce(v_cost, 0);

  v_diff := p_counted_qty - v_on_hand;

  -- One signed adjustment: surplus (+), loss (−), or a zero-qty move for a
  -- matched count so every count stays in the ledger/history.
  insert into stock_moves (product_id, qty, reason, ref_type, unit_cost, note)
    values (p_product_id, v_diff, 'opname_adj', 'product_opname', v_cost, p_note);

  return v_diff;
end $function$;
