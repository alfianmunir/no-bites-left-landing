-- Ops ERP Phase 14 — configurable in-kind giveaway cost in Budget vs Spend.
--
-- Sample/KOL/R&D units carved out of production (ops.batch_lines.qty_sample /
-- qty_kol / qty_rnd) have a real made-cost but are non-cash, so they only show
-- on the P&L (Samples/KOL, R&D lines) and never touched the marketing budget
-- view (which reads the ops.expenses cash ledger). This adds a per-category
-- opt-in: when count_inkind = true, listBudgetVsSpend folds the period's
-- carve-out made-cost into that category's spend. Mapping (app-side):
--   qty_sample + qty_rnd → 'mkt_rnd_tester'   ·   qty_kol → 'mkt_endorsement'.
-- Default false = unchanged (cash-only) behaviour; toggled from Money → Budgets.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. Apply to the live `ops` schema.

alter table ops.expense_categories add column if not exists count_inkind boolean not null default false;
