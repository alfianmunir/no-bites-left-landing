-- No Bites Left — Finpay orders schema (Postgres)
-- PRD §13 "Orders schema (minimum)". Run against Supabase/Neon in prod.

CREATE TABLE IF NOT EXISTS orders (
  id               TEXT PRIMARY KEY,           -- NBL-<ts>-<rand>, alpha-dash, <=30 chars
  items            JSONB NOT NULL,             -- [{sku, name, qty, unit_price}]
  amount           INTEGER NOT NULL,           -- IDR, integer (items + courier fee)
  customer         JSONB NOT NULL,             -- {email, firstName, lastName, mobilePhone}
  status           TEXT NOT NULL DEFAULT 'PENDING',
    -- v1 PICKUP:  PENDING | PAID | BAKING | READY_FOR_PICKUP | PICKED_UP | EXPIRED | CANCELLED | REFUNDED
    -- v2 DELIVERY adds: OUT_FOR_DELIVERY | DELIVERED   (PICKED_UP/DELIVERED == old FULFILLED alias)
  finpay_reference TEXT,
  redirect_url     TEXT,
  expiry_link      TIMESTAMPTZ,
  callback_log     JSONB NOT NULL DEFAULT '[]',  -- append raw verified callbacks
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- v1 PICKUP additions (E2E PRD §6). ADD COLUMN IF NOT EXISTS so re-running
-- this against the existing table (CREATE TABLE IF NOT EXISTS no-ops there)
-- still picks these up.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment TEXT NOT NULL DEFAULT 'PICKUP';
  -- 'PICKUP' (v1) | 'DELIVERY' (v2)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_date DATE;
  -- chosen pickup date, >= order_day + 3 (v1)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_history JSONB NOT NULL DEFAULT '[]';
  -- [{status, at, by}] — audit trail + timeline (every state change appends)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id TEXT;
  -- customer id (Supabase auth / mock session) at time of order; powers "My Orders"

-- v2 delivery columns (dormant in v1 — null for PICKUP orders). Kept, not dropped,
-- so flipping FULFILLMENT to 'DELIVERY' needs no migration.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address JSONB;
  -- {recipientName, phone, area, fullAddress, notes}
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS courier JSONB;
  -- {code, name, fee, etaLabel}
-- Retired: fulfillment_stage (folded into single-axis `status` — E2E PRD §3).
-- Old rows may still have the column; it is simply ignored now.

CREATE INDEX IF NOT EXISTS orders_status_idx       ON orders (status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx   ON orders (created_at);
CREATE INDEX IF NOT EXISTS orders_user_id_idx      ON orders (user_id);
CREATE INDEX IF NOT EXISTS orders_pickup_date_idx  ON orders (pickup_date);
CREATE INDEX IF NOT EXISTS orders_delivery_date_idx ON orders (delivery_date);

-- Saved addresses, keyed by the mock session's user id (lib/session.ts).
CREATE TABLE IF NOT EXISTS addresses (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  label          TEXT NOT NULL DEFAULT 'Address',
  recipient_name TEXT NOT NULL,
  phone          TEXT NOT NULL,
  area           TEXT NOT NULL,
  full_address   TEXT NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS addresses_user_id_idx ON addresses (user_id);
