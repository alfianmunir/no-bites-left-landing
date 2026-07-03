# Handoff — No Bites Left / Finpay PG Integration

## What this is
Building online payment (Finpay **Hosted Payment**) to replace the WhatsApp-only order path on nobitesleft.com. Spec: `PRD - Finpay PG Integration (Order Purchasing).md`, kept **outside** this repo at `.../BUSINESS/No Bites Left/No Bites Left Landing/` (not copied in — that folder also has the Cafe Pricing.xlsx source-of-truth for `lib/prices.ts`; ask before adding either to this repo, since it has a GitHub remote). Build follows the PRD's phase plan (§11); complete + test each phase before the next; the webhook (Phase 2) is the highest-risk piece.

Phase 3/4 (the full ordering flow + admin) were built against a separate design handoff (`Ordering Flow.dc.html` + its `README.md`, a hi-fi HTML prototype — not shippable code, ported faithfully into this Next.js app). That design introduces Google sign-in, courier rate shopping, and delivery-date scheduling — all **new scope** versus the original Finpay PRD's non-goals ("no customer accounts", "no delivery/shipping logistics"). Per explicit direction: build the full UI now, stub the backends that need real external accounts (Google OAuth, a courier/rate-aggregator API) — see "Mock/stubbed subsystems" below.

## Where the code is
`finpay-backend/` at the root of the `no-bites-left-landing` git repo (alongside the static landing page, `index.html`). Next.js 15 (App Router), TypeScript, Node 24. Read `README.md` and `PHASE0_FINDINGS.md` first. Untracked so far — `git status` shows `finpay-backend/` as new, nothing committed yet. (This folder used to live standalone outside any repo; it was moved in here on 2026-07-03 to be deployable alongside the landing page and get a public URL for the webhook — the old standalone copy has been deleted.)

## Status
- **Phase 0 ✅** — Live sandbox smoke test passes: `initiate`, `check-status`, and the callback-signature approach (HMAC-SHA512 over the **raw body minus the `signature` field** — string-surgery, not re-encode; this is the PRD's #1 warned bug). Discovered undocumented status value `REQUEST_INITIATED` = pending.
- **Phase 1 ✅** — `POST /api/orders` (validates cart against server-side price list, recomputes amount server-side, creates PENDING order, calls Finpay initiate, returns `redirectUrl`) + `/order/[id]` status page (reads DB only, never marks PAID). Verified E2E against sandbox: happy path, client-amount-tampering ignored, all validation rejections, persistence, log redaction. `npm run test:phase1`, `tsc`, and `build` all green.
- **Phase 2 ✅** — `POST /api/finpay/callback` webhook. Fetched Finpay's public docs directly to confirm the exact callback payload shape (`customer`/`order`/`card`/`meta`/`result.payment.status`/`signature`) — matches what the PRD/Phase 0 assumed, so that risk is mostly retired. Implements: signature verify (raw body minus `signature`) → order lookup → append verified callback to `callback_log` → idempotent no-op on final states or repeated status → **check-status defense-in-depth** (only acts if live Finpay `checkStatus` agrees with the callback's claimed status) → amount-match guard before marking PAID → `notifyOpsPaid` stub (Phase 4 will wire real delivery). Status mapping (`lib/finpayStatus.ts`) is tolerant: unrecognized values leave the order unchanged and log for review rather than guessing.
  - `npm run test:phase2` (unit: status mapping + signature over the confirmed real shape) and `python3 phase2_smoke_test.py` (live, needs `npm run dev` running) both green. The live test's key result: a **validly-signed but forged "CAPTURED" callback is correctly blocked**, because the order was never actually paid in Finpay's sandbox and live check-status still reports it pending — proving the defense-in-depth actually defends. `tsc` and `build` green too.
  - **Still open:** no callback has come from Finpay itself yet — need a public HTTPS URL (deploy or tunnel) + an actually-completed sandbox payment to fully close out the "does our parsing match Finpay's real wire format" risk. See Next steps.
  - `/order/[id]` already rendered all six lifecycle states before Phase 2 started (built ahead in Phase 1), so no changes were needed there.
- **Phase 3 ✅** — full customer ordering flow (shop → cart drawer → sign-in gate → address/saved-addresses → shipping/courier → H+3 delivery date → review & pay → the now-much-richer `/order/[id]` timeline → My Orders). Cart and in-progress checkout state are client-side (Context + localStorage), not server tables. `orders` table extended with `delivery_address`/`delivery_date`/`courier`/`fulfillment_stage`/`user_id` (migration is additive `ADD COLUMN IF NOT EXISTS`, safe to re-run). `POST /api/orders` now folds the courier fee into `amount` and recomputes it server-side from `lib/courier.ts` — never trusts a client-sent fee, same principle as item prices.
  - Hit and fixed a real bug while smoke-testing: node-postgres parses `DATE` columns into JS `Date` objects using the **server process's local timezone** (this machine is Asia/Jakarta, UTC+7), so a naive `.toISOString()` silently shifted `delivery_date` back a day. Fixed in `lib/db.ts` via `pg.types.setTypeParser(1082, v => v)` — keeps `DATE` as the raw `"YYYY-MM-DD"` string instead. Worth remembering if any other DATE/TIMESTAMP column gets added later.
  - `tsc`, `build`, and a full live smoke test (order creation, address save/reuse, admin-bypassed fulfillment-stage rendering for all timeline states, bake-sheet aggregation) all green.
- **Phase 4 ✅** — admin work queue: `lib/adminAuth.ts` (shared-password signed cookie, same HMAC pattern as the Finpay signature check) gates `/admin/*` and `/api/admin/*` (checked per-page/route, not via `middleware.ts` — Next's Edge Middleware runtime doesn't support `node:crypto`, and fighting that wasn't worth it for a 1-2 person internal tool). Order queue grouped by delivery date, order detail with advance/cancel/refund (reusing the already-built `cancelOrder`/`refundOrder`), bake sheet. Verified live against the real Finpay sandbox: `cancel` succeeds for a genuinely-PENDING order; `refund` correctly **fails** (502, no DB mutation) for a test order that was never actually captured by Finpay — that's the right behavior, not a bug.
  - **Still stubbed:** `lib/notify.ts` (ops notify) logs only, no real email/WhatsApp; no reconciliation job yet.

## Mock/stubbed subsystems (know before extending)
- **`lib/session.ts`** — "Continue with Google" is one click, no real OAuth, no real email. Fine for demoing the flow; swap for real Google OAuth (e.g. NextAuth) before launch. `POST /api/orders`'s `customer.email` currently comes from this synthetic session, not a real address — there's no separate contact-info form in the design (it assumed real sign-in would supply the email).
- **`lib/courier.ts`** — static 3 options, no real courier/rate-aggregator (Biteship-class) account. Demo triggers documented inline (typing "bandung" → out of coverage, "no couriers" → empty, "fail" → error) so every design state is reachable without a real API.
- **`lib/deliveryDate.ts#isCapacityClosed`** — always returns `false`. No real bake-capacity system exists (PRD §9 open question).
- **`lib/adminAuth.ts`** — one shared password (`ADMIN_PASSWORD`), no per-admin accounts. Matches original PRD §8 ("Basic auth or magic link — no user system").

## Key files
- `lib/prices.ts` — server-side price list (source of truth for amounts)
- `lib/finpay.ts` — Finpay client: `initiate`, `checkStatus`, `cancelOrder`, `refundOrder`, `verifyCallbackSignature`, `stripSignatureField`
- `lib/finpayStatus.ts` — maps Finpay's payment-status strings → our `OrderStatus`
- `lib/notify.ts` — `notifyOpsPaid` (stub: logs only, no real email/WhatsApp yet)
- `lib/db.ts` — `OrderStore` abstraction: `PostgresStore` (when `DATABASE_URL` set) | `FileStore` (dev, `.dev-data/orders.json`) — see the DATE-timezone fix note above before touching `rowToOrder`
- `lib/addressStore.ts` — saved addresses, same Postgres/file-store pattern
- `lib/session.ts` / `lib/adminAuth.ts` / `lib/signedCookie.ts` — mock customer session, admin session, shared HMAC-signed-cookie helper
- `lib/cart/CartContext.tsx` / `lib/checkout/CheckoutDraftContext.tsx` — client-side cart + in-progress checkout state
- `lib/courier.ts` / `lib/deliveryDate.ts` — stubbed courier rates, H+3 delivery-date logic
- `lib/orders.ts` / `lib/env.ts` / `lib/log.ts` (secret-redacting)
- `app/api/orders/route.ts`, `app/api/finpay/callback/route.ts`, `app/order/[id]/{page.tsx,OrderStatusView.tsx}`, `app/admin/**`, `db/schema.sql` — see `README.md` for the full route map

## Decisions already made (don't re-litigate)
- **Prices = Cafe Pricing.xlsx "Suggested Retail at Cafe" column** (8 cookie SKUs: og/hazel/choco/matcha × 40g/100g). **Apple Pie & Brownies are intentionally NOT orderable** (not in that sheet) — do not invent prices.
- **Sandbox creds** in `.env.local` (gitignored): MID `MAMAMM688`, base `https://devo.finnet.co.id`. **Sandbox only until Munir approves prod cutover.**

## Environment quirks (important)
- **No system Node/Homebrew.** Node 24 is at `~/.local/node-v24.18.0-darwin-arm64/bin` (added to `~/.zshrc`). A fresh interactive VSCode terminal will have `node`/`npm`/`npx` on PATH.
- The repo path contains a **curly apostrophe** (`Alfian's`), which breaks some sandboxed preview tooling — not an issue for normal `npm run dev` + browser.

## Supabase — done
- `DATABASE_URL` is set (Supabase Transaction pooler URI, `aws-1-ap-southeast-1.pooler.supabase.com:6543`) and `npm run db:init` has been run against it — `orders` and `addresses` tables exist with the Phase 3 columns. The app runs on Postgres now, not the dev file store.
- Project-scoped MCP config still at `.mcp.json` (Supabase MCP, `project_ref=ticdiatbdxkmpzmqvntn`) if you need to query/administer the project directly.

## Next
1. **Validate against a REAL Finpay callback** (still the single biggest open risk — Phase 2 could only prove this against Finpay's own sandbox `checkStatus`, not a callback Finpay itself sends): stand up a public HTTPS URL (deploy to Vercel, or a tunnel — `npx localtunnel --port 3000` is a pure-npm option since this machine has no Homebrew for ngrok/cloudflared), set `PUBLIC_BASE_URL`, complete a real sandbox payment through Finpay's hosted page, confirm the callback verifies and the order flips to PAID. Needs a human at a browser; not scriptable.
2. **Wire the two apps together for deployment.** `vercel.json` at the repo root only knows about the static landing page (4 rewrites, no mention of `finpay-backend/`), and `finpay-backend/` has no monorepo/`basePath` config. Decide: separate Vercel project + subdomain, or restructure into one deployment with routing rules. Needed before step 1 can use a real deploy (a tunnel works in the meantime).
3. **Real integrations behind the stubbed seams** (see "Mock/stubbed subsystems" above): Google OAuth, a courier/rate-aggregator account, real ops notification delivery, a reconciliation job, bake-capacity limits.
4. **Confirm the "Order these again" button** on the Delivered order-status screen — it's currently a no-op button (design calls for it to re-add items to cart); wire it to `useCart().addItem` if wanted.

## Open items (from PRD §12 + build)
- Confirm enabled payment methods for MID (QRIS + e-wallets priority) — Munir/Finpay.
- Confirm full payment-status enum + `expiryLink` timezone + callback retry policy — Finpay support. (`lib/finpayStatus.ts` is intentionally tolerant of unrecognized values in the meantime.)
- KYB in parallel (Munir) for prod credentials.
- Keep WhatsApp order path as fallback.
- Real Finpay callback still unvalidated (see Next steps #1 above) — the single biggest remaining risk before calling the webhook done.
- Daily bake-capacity cap, delivery time windows, free-shipping threshold, self-cancel cutoff — all flagged as undesigned/open in the Ordering Flow spec itself (§9).

## Run
```bash
export PATH="$HOME/.local/node-v24.18.0-darwin-arm64/bin:$PATH"  # if node not found
cd "No Bites Left Landing/finpay-backend"
npm install && npm run dev   # dev checkout harness at http://localhost:3000
npm run test:phase1          # unit checks (prices, order-id, signature)
npm run test:phase2          # unit checks (status mapping, signature)
python3 phase0_smoke_test.py # live sandbox smoke test (initiate + signature)
python3 phase2_smoke_test.py # live webhook smoke test (needs `npm run dev` running)
```
