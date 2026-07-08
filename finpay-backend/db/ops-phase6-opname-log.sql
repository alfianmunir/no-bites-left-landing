-- Ops ERP Phase 6 (Opname log) — record matched counts too.
--
-- post_opname previously returned early on a zero variance, leaving no trace of
-- counts that matched the system. To categorise every count as surplus / loss /
-- equal and show a full history, we now also log an "equal" count as a zero-qty
-- opname_adj move (harmless to balances — adds 0 — but keeps every count in the
-- ledger). Surplus (+qty) and loss (−qty via consume_fefo) behaviour is unchanged.
--
-- Apply to the live `ops` schema. Idempotent (CREATE OR REPLACE). No data change
-- to existing rows; existing surplus/loss opname moves already display.

create or replace function ops.post_opname(p_item_id uuid, p_counted_qty numeric, p_note text default null)
 returns numeric
 language plpgsql
 set search_path to 'ops'
as $function$
declare v_on_hand numeric; v_diff numeric; v_cost numeric;
begin
  select coalesce(sum(qty), 0) into v_on_hand from stock_moves where item_id = p_item_id;
  v_diff := p_counted_qty - v_on_hand;
  select avg_cost into v_cost from items where id = p_item_id;
  if v_diff = 0 then
    -- Matched count: log a zero-qty move so it shows in the opname history.
    insert into stock_moves (item_id, qty, reason, ref_type, unit_cost, note)
      values (p_item_id, 0, 'opname_adj', 'opname', v_cost, p_note);
    return 0;
  elsif v_diff < 0 then
    perform ops.consume_fefo(p_item_id, -v_diff, 'opname_adj', 'opname', null, p_note);
  else
    insert into stock_moves (item_id, qty, reason, ref_type, unit_cost, note)
      values (p_item_id, v_diff, 'opname_adj', 'opname', v_cost, p_note);
  end if;
  return v_diff;
end $function$;

-- Cutoff: only surface opname adjustments recorded from deployment onward — the
-- historical initial-count surpluses are ignored. Set once, at first apply, so
-- re-running this migration never moves the cutoff.
insert into ops.config (key, value, updated_at)
select 'opname_since', to_jsonb(now()::text), now()
where not exists (select 1 from ops.config where key = 'opname_since');
