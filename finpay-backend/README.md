# No Bites Left — Ordering + Finpay backend

Full ordering flow (browse → cart → address/shipping/date → pay via **Finpay
Hosted Payment** → order status) plus a small admin work queue, per
`.../BUSINESS/No Bites Left/No Bites Left Landing/PRD - Finpay PG Integration (Order Purchasing).md`
and the `Ordering Flow.dc.html` design handoff. Sandbox only until Munir
approves production cutover.

## Stack
- **Next.js 15 (App Router)** on Node 24. Deploy to Vercel.
- **Storage:** Postgres (Supabase) via `DATABASE_URL`; a local file-backed dev
  store (`.dev-data/`) when it's empty.
- **Styling:** plain CSS custom properties + a few utility classes in
  `app/globals.css` (design tokens ported from the Ordering Flow spec) — no
  Tailwind/component library.
- **No secrets client-side.** All Finpay calls are server-only.

## Mock auth — important, read before touching sign-in
There is **no real Google OAuth yet**. `lib/session.ts` issues a one-click,
no-form signed cookie identity ("Continue with Google" just creates a stable
per-browser id). It's enough to power saved addresses and My Orders, but the
email it generates (`guest-xxxx@example.com`) isn't a real customer email.
Swap `lib/session.ts` for real Google OAuth (e.g. NextAuth) before launch —
`getSession()`/`createMockSession()` are the seam. Same story for
`lib/courier.ts` (stubbed courier rates — no Biteship-class account exists
yet; see the special-string demo triggers documented in that file) and
`lib/adminAuth.ts` (single shared password, `ADMIN_PASSWORD`, no per-admin
accounts).

## Setup
```bash
# Node is installed at ~/.local/node-v24.18.0-darwin-arm64/bin (added to ~/.zshrc).
export PATH="$HOME/.local/node-v24.18.0-darwin-arm64/bin:$PATH"
npm install
npm run dev            # http://localhost:3000
```

## Env (`.env.local`, never committed)
| Var | Meaning |
| --- | --- |
| `FINPAY_MERCHANT_ID` / `FINPAY_MERCHANT_KEY` | Sandbox access keys |
| `FINPAY_BASE_URL` | `https://devo.finnet.co.id` (sandbox) → `https://live.finnet.co.id` at cutover |
| `PUBLIC_BASE_URL` | Public origin of THIS backend, for success/fail/callback URLs |
| `DATABASE_URL` | Postgres conn string (Supabase pooler URI). Empty ⇒ dev file store |
| `ADMIN_PASSWORD` | Shared admin password, gates `/admin/*` |
| `SESSION_SECRET` | Signs the mock customer + admin session cookies (has an insecure dev fallback — set a real value before deploying) |
| `OPS_NOTIFY_EMAIL` | Phase 4 stub target (still logs only, no real delivery) |

## Scripts
- `npm run dev` / `build` / `start`
- `npm run db:init` — apply `db/schema.sql` (adds columns via `ADD COLUMN IF
  NOT EXISTS`, so safe to re-run against an existing table)
- `npm run test:phase1` / `test:phase2` — unit checks (prices/order-id/status-mapping/signature)
- `python3 phase0_smoke_test.py` / `phase2_smoke_test.py` — live sandbox/webhook smoke tests

## Customer flow (routes)
```
/                     shop grid (8 SKUs, lib/prices.ts) — replaces the old dev-checkout harness
  → cart drawer        global overlay (lib/cart/CartContext.tsx), localStorage-persisted
  → sign-in modal       gates "Checkout"; mock session (see above)
/checkout/address     form + saved addresses (lib/addressStore.ts) + out-of-coverage/failed states
/checkout/shipping    courier rate lookup (lib/courier.ts, STUBBED) + loading/error/no-coverage states
/checkout/date        H+3 delivery-date picker (lib/deliveryDate.ts)
/checkout/review      final total, "Pay now" → POST /api/orders → Finpay redirect
/order/[id]           status page: redirect-return screens (success/fail/pending) +
                      persistent timeline (Paid → Baking → Out for delivery → Delivered) +
                      terminal states (Expired/Cancelled/Refunded)
/orders               "My Orders" list for the current mock session
```
`app/checkout/*` state (address/courier/date) lives in
`lib/checkout/CheckoutDraftContext.tsx`, persisted the same way as the cart so
it survives navigation and reloads across the multi-step flow.

## Admin (routes, password-gated via lib/adminAuth.ts)
```
/admin/login          shared-password sign-in
/admin                order queue, grouped by delivery date (PAID orders) + an EXPIRED section
/admin/orders/[id]    customer/items/progress rail + Mark as [next stage] / Cancel / Refund
/admin/bake-sheet     SKU quantities aggregated across PAID+FULFILLED orders for a date (?date=)
```
Cancel only applies to PENDING orders (Finpay's cancel endpoint is for unpaid
orders); Refund applies to PAID/FULFILLED orders. Both call the already-built
`cancelOrder`/`refundOrder` in `lib/finpay.ts`.

## Status by PRD phase
- ✅ **Phase 0/1/2** — sandbox smoke tests, `POST /api/orders`, and the
  `POST /api/finpay/callback` webhook (signature verify, check-status
  defense-in-depth, idempotency). See `PHASE0_FINDINGS.md` and git history.
  **Still open:** a callback Finpay itself actually sends, for a real
  completed sandbox payment — needs a public URL (tunnel/deploy), not yet done.
- ✅ **Phase 3** — full customer ordering flow above, built against the
  Ordering Flow design spec. Auth, courier rates, and bake-capacity are
  intentionally stubbed (see "Mock auth" above) — real integrations are a
  follow-up, not a rebuild, since the seams (`lib/session.ts`,
  `lib/courier.ts`, `lib/deliveryDate.ts#isCapacityClosed`) are isolated.
- ✅ **Phase 4** — admin queue, order detail actions (advance/cancel/refund),
  bake sheet. **Still stubbed:** real ops notification delivery
  (`lib/notify.ts` logs only) and a daily reconciliation job (sweep
  non-final orders via `checkStatus`) — neither exists yet.
- ⏭️ **Phase 5** — sandbox E2E per payment method (this is also where the
  real-callback validation above gets closed out), KYB, production cutover.

## Known limitation worth flagging
`POST /api/orders`'s `customer.email` comes from the mock session's synthetic
guest email, not a real address — there's no separate "customer contact"
form in this flow (the design didn't include one, assuming real Google
sign-in would supply it). Fix this when real OAuth lands, or the payment
receipt email will go nowhere real.

## Key files
```
lib/env.ts                validated env access (secrets server-only)
lib/prices.ts              server-side price list (8 orderable SKUs)
lib/orders.ts              order/domain types incl. DeliveryAddress, CourierChoice, FulfillmentStage
lib/db.ts                  OrderStore: Postgres | dev file store (note the DATE-column
                           timezone fix in PostgresStore.pool() — see inline comment)
lib/addressStore.ts        saved addresses, same Postgres/file-store pattern as lib/db.ts
lib/session.ts             mock customer session (NOT real auth — see above)
lib/adminAuth.ts           admin session (shared password, signed cookie)
lib/signedCookie.ts        generic HMAC-signed cookie helper, shared by both auth modules
lib/cart/CartContext.tsx   client cart state + localStorage
lib/checkout/CheckoutDraftContext.tsx   in-progress checkout state across the multi-step flow
lib/courier.ts             STUBBED courier rate lookup
lib/deliveryDate.ts        H+3 delivery-date logic; isCapacityClosed is a stub
lib/finpay.ts               Finpay client: initiate, checkStatus, cancel, refund, signature verify
lib/finpayStatus.ts         maps Finpay's payment-status strings -> our OrderStatus
lib/notify.ts               ops-notify-on-paid (stub: logs only)
app/api/orders/route.ts                POST /api/orders (now folds in address/courier/date)
app/api/finpay/callback/route.ts       POST /api/finpay/callback (webhook)
app/order/[id]/{page.tsx,OrderStatusView.tsx}   status page (server fetch + client rendering)
app/admin/**                           admin queue/detail/bake-sheet
db/schema.sql                          Postgres DDL (orders + addresses)
```
