# Website `orders` → Ops `sales_orders` — integration contract

Authoritative facts from the payment/order branch (finpay-backend), for the ops-ERP
`syncWebsiteOrders()` (Phase B). Nothing here requires editing finpay-backend — the
ops sync reads `public.orders` and writes only ops-side tables.

Source of truth: `finpay-backend/lib/orders.ts`, `finpay-backend/db/schema.sql`,
`finpay-backend/lib/menuStore.ts` (all verified 2026-07-09).

---

## 1. Read `orders.status` — the single source of truth

Payment is Finpay Hosted Payment (VA). The Finpay webhook (`/api/finpay/callback`)
flips `orders.status` → `PAID` server-side after signature + check-status + amount
verification. The ops sync must key off `orders.status`; never infer payment from
the client or the redirect.

## 2. Columns available on `public.orders`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `NBL-<ts>-<rand>`, ≤30 chars, alpha-dash. **Use this as `source_order_id`.** |
| `items` | JSONB | `[{ sku, name, qty, unit_price }]` — see §4. |
| `amount` | INTEGER | IDR, server-computed (items + courier fee). Cash-in total. |
| `customer` | JSONB | `{ email, firstName, lastName, mobilePhone }` — PII. |
| `status` | TEXT | Lifecycle — see §3. |
| `fulfillment` | TEXT | `PICKUP` (v1) \| `DELIVERY` (dormant). |
| `pickup_date` | DATE | `YYYY-MM-DD`, ≥ order day + 3 (PICKUP orders). |
| `status_history` | JSONB | `[{ status, at, by }]` audit trail; `at` of the `PAID` event = paid timestamp. |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

There is **no `source_order_id` column on `public.orders`** — the link lives on the
ops `sales_orders` side pointing back here (`sales_orders.source_order_id = orders.id`).

## 3. Status lifecycle — the "paid-or-beyond" predicate

```
PENDING → PAID → BAKING → READY_FOR_PICKUP → PICKED_UP
                              (+ EXPIRED | CANCELLED | REFUNDED)
```

Production chain (`PICKUP_PROGRESSION` in lib/orders.ts):
`["PAID", "BAKING", "READY_FOR_PICKUP", "PICKED_UP"]`

**"Paid-or-beyond" = the order has reached PAID or later in that chain.** Concretely,
sync an order iff:

```
status ∈ { PAID, BAKING, READY_FOR_PICKUP, PICKED_UP }
```

- `PENDING` → not paid yet, skip.
- `EXPIRED` / `CANCELLED` → never paid, skip.
- `REFUNDED` → **was** paid then reversed. Recommend: do NOT create a new sales order;
  if one already exists for this `source_order_id`, reflect the reversal ops-side.
  (Confirm with ops finance rules — money already drew down COGS on the original sync.)
- `PICKED_UP` is terminal-completed but still "paid-or-beyond" — sync it (it was paid).

DELIVERY equivalents (dormant, only if `fulfillment='DELIVERY'` ever ships):
`OUT_FOR_DELIVERY`, `DELIVERED` also count as paid-or-beyond.

## 4. `items[]` jsonb shape → `menu_product_map`

Each line: `{ sku: string, name: string, qty: number, unit_price: number }`

- `sku` is the map key. `name` is display-only, e.g. `"OG Cookies (Personal 40g)"`.
- `qty` is the number of that SKU ordered. Multiply by the map's `qtyPer` (units of the
  ops finished-good product per website SKU) → ops quantity to draw down.
- `unit_price` is integer IDR per unit (already in `amount`; don't re-sum for cash-in,
  use `orders.amount`).

### Complete orderable SKU list (map keys the ops `menu_product_map` must cover)

| SKU | Product | Variant | unit_price (IDR) |
|---|---|---|---|
| `og-40` | OG Cookies | Personal 40g | 20000 |
| `og-100` | OG Cookies | Full Max 100g | 48000 |
| `choco-40` | Choco Mania | Personal 40g | 22000 |
| `choco-100` | Choco Mania | Full Max 100g | 53000 |
| `hazel-40` | Hazel Lover | Personal 40g | 22000 |
| `hazel-100` | Hazel Lover | Full Max 100g | 53000 |
| `matcha-40` | Matcha | Personal 40g | 25000 |
| `matcha-100` | Matcha | Full Max 100g | 59000 |

Coming-soon (NOT orderable, will never appear in `items`): `apple`, `brownies`.
New SKUs can be added in the `menu_items` DB table — an unmapped SKU should be
**flagged/skipped loudly**, never silently dropped (matches the ops plan).

## 5. Idempotency

Website order `id` is stable and unique. `syncWebsiteOrders()` must be safe to run
repeatedly (it runs on Orders-page load + a manual button):

1. `SELECT id, status, items, amount, pickup_date, status_history FROM orders
    WHERE status IN ('PAID','BAKING','READY_FOR_PICKUP','PICKED_UP')`
2. For each, skip if a `sales_orders` row already has `source_order_id = orders.id`.
3. Else map items → `createSalesOrder` (draws down finished goods + books COGS) →
   `updateOrderState(... paid)` (posts the cash-in = `orders.amount`).

Guard the create+link in one transaction (or create-then-link with the link as the
uniqueness constraint) so a mid-run failure never double-creates.

## 6. No changes needed on the payment branch

Paid website orders land in `public.orders` with `status='PAID'` (via the Finpay
webhook). The ops sync reads that and writes only ops-side tables. This file is the
only handoff the ops session needs; `finpay-backend/**` can stay read-only to it.
