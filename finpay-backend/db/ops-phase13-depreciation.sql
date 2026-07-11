-- Ops ERP Phase 13 (Audit H3) — depreciation posted as a monthly non-cash opex.
--
-- Problem (audit §H3): depreciation was only computed live in the P&L view
-- (getPnL summed listAssets().monthlyDepreciation). It never hit a ledger, so
-- the P&L wasn't reproducible from posted rows and no monthly close existed.
--
-- Fix: at month close, post ONE ops.expenses row (category 'opex_depreciation',
-- already seeded) for the sum of owned-asset monthly depreciation — flagged
-- non_cash so it carries NO paired cash_entries row (depreciation never moves
-- cash). getPnL then reads depreciation from that posted expense instead of
-- recomputing, and excludes it from the general opex sum.
--
-- This column is the only schema change. Idempotent: ADD COLUMN IF NOT EXISTS.
-- Apply to the live `ops` schema (project ticdiatbdxkmpzmqvntn).

alter table ops.expenses add column if not exists non_cash boolean not null default false;

-- (Optional documentation) opex_depreciation is expected to exist already
-- (seeded 11 Jul with the audit corrections). This is a safety net only.
insert into ops.expense_categories (code, name, type)
select 'opex_depreciation', 'Depreciation (non-cash)', 'opex'
where not exists (select 1 from ops.expense_categories where code = 'opex_depreciation');
