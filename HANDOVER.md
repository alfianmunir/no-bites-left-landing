# No Bites Left — Technical Handover

Brief for picking up this project cold. **No Bites Left** is a premium hand-baked-goods brand in Jakarta. This repo is its **production website + ordering system**: a single Next.js app serving the marketing landing page *and* the full pickup-order flow (cart → Google sign-in → pickup date → Finpay payment → status/tracking) plus an admin ops console.

> ⚠️ **This is LIVE and handles real money.** `nobitesleft.com` is in production, Finpay is on the **live** gateway, and `main` auto-deploys to prod. Treat changes accordingly.

---

## 1. Where everything lives

- **Repo root:** `no-bites-left-landing/` (has a GitHub remote: `github.com/alfianmunir/no-bites-left-landing`). Default/production branch = **`main`**.
- **The app:** everything is in **`finpay-backend/`** (Next.js 15, App Router, TypeScript). This is what's deployed.
- Repo root also contains a legacy static `index.html` (the OLD marketing site) + `vercel.json` — **retired**, no longer served. Ignore unless doing archaeology.
- The repo path contains a **curly apostrophe** (`…Alfian’s MacBook Pro…`) which breaks some sandboxed tooling — normal `npm`/`git`/`curl` are fine; quote paths.

## 2. Live topology

- **Domain:** `nobitesleft.com` + `www.nobitesleft.com` → Vercel project **`nbl-order`** (git-connected to this repo, `main` = production, branch pushes = preview).
- The old static-landing Vercel project (`no-bites-left-landing`) previously owned the domain; the domain was **moved** to `nbl-order`. The old project still exists as a fallback.
- **Vercel project config that matters:** Root Directory = `finpay-backend`, Framework Preset = **Next.js**. (A missing framework preset makes it serve only `public/` → 404s.)
- **Preview deploys are kept on the Finpay SANDBOX** (separate env values); only **production** is live Finpay.

## 3. Stack

- Next.js 15 (App Router) · React 19 · TypeScript 5.7 (strict) · Node 24.
- **Serverless functions** on Vercel (`runtime = "nodejs"`, not Edge — needs `node:crypto` + `pg`). Admin auth is checked per-route/page (Edge middleware can't do `node:crypto`).
- **PostgreSQL via Supabase** (Transaction pooler). Raw **`pg`**, **no ORM**.
- Key deps: `@supabase/ssr`, `@supabase/supabase-js`, `pg`, `resend`.

## 4. Running it locally

Node is **not on PATH by default**; it lives at `~/.local/node-v24.18.0-darwin-arm64/bin`:
```bash
export PATH="$HOME/.local/node-v24.18.0-darwin-arm64/bin:$PATH"
cd finpay-backend
npm install
npm run dev            # http://localhost:3000
npx tsc --noEmit       # typecheck
npm run build          # prod build (also lints)
npm run test:phase1    # unit: prices, order-id, finpay signature
npm run test:phase2    # unit: status mapping, signature
npm run db:init        # apply db/schema.sql to DATABASE_URL (Supabase) — PROD DB, careful
```
Local dev uses **file-store fallbacks** when `DATABASE_URL` is empty (`.dev-data/*.json`). To exercise the dev mock login path, also unset the Supabase env (else the mock is disabled by design). Verify against the live app with `curl https://nobitesleft.com/...`.

## 5. Environment variables (set in Vercel; **values never in git**)

`.env.local` is gitignored (local only). Production values are in **Vercel → nbl-order → Settings → Env**. Names:

| Var | Purpose |
|---|---|
| `FINPAY_MERCHANT_ID` / `FINPAY_MERCHANT_KEY` / `FINPAY_BASE_URL` | Finpay PG. **Prod = `https://live.finnet.co.id`, MID `MAMAMM688`.** Sandbox = `https://devo.finnet.co.id`. |
| `PUBLIC_BASE_URL` | Origin used to build Finpay callback/return URLs. Prod = `https://nobitesleft.com`. |
| `DATABASE_URL` | Supabase Postgres pooler URI (project ref `ticdiatbdxkmpzmqvntn`). Empty → file store. |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase auth (client). |
| `SESSION_SECRET` | HMAC for admin (+ legacy mock) signed cookies. |
| `ADMIN_PASSWORD` | Shared admin login password. |
| `RESEND_API_KEY` / `MAIL_FROM` / `MAIL_REPLY_TO` / `OPS_NOTIFY_EMAIL` | Resend email; ops inbox = `nobitesleft.id@gmail.com`. Sender domain `nobitesleft.com` verified in Resend. |
| `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile captcha. **Not set yet** → captcha is a graceful no-op. |

`isSandbox` (in `lib/env.ts`) is true iff base URL contains `devo.finnet.co.id`.

## 6. Data model (`finpay-backend/db/schema.sql`)

- **`orders`** — one row per order. Key cols: `id` (`NBL-<ts>-<rand>`), `items` (jsonb), `amount` (int IDR, server-computed), `status`, `fulfillment` (`PICKUP`|`DELIVERY`), `pickup_date`, `customer` (jsonb PII), `status_history` (jsonb audit), `callback_log`, `redirect_url`, `expiry_link`, `user_id`. v2 delivery cols dormant.
- **`menu_items`** — DB-driven catalog (Phase 1). One row per SKU (denormalized family fields: name, variant, `unit_price`, image, accent, EN/ID tag/note/description, `available`, `sort_order`). **Server-side price source of truth.** Auto-seeded from `lib/menuStore` `CATALOG` if empty. Edit rows in Supabase to change the menu.
- **`feedback`** — customer reviews (`rating`, `name`, `flavour`, `message`). Powers the showcase (4–5★ + non-empty message).
- **`wholesale_requests`** — B2B tasting requests (+ `followed_up` bool for admin).
- **`addresses`** — saved addresses (v2, dormant).

## 7. Order lifecycle (`lib/orders.ts`)

Single-axis state machine (v1 PICKUP):
```
PENDING → PAID → BAKING → READY_FOR_PICKUP → PICKED_UP   (+ EXPIRED | CANCELLED | REFUNDED)
```
- `canTransition()` / `nextFulfillmentStatus()` guard transitions server-side; illegal ones rejected. `store.setStatus()` appends `{status, at, by}` to `status_history`.
- v2 DELIVERY (`OUT_FOR_DELIVERY → DELIVERED`, courier/address) is built but **dormant** behind the `FULFILLMENT` flag in `lib/fulfillment.ts`.
- Pickup date: min **H+3** (`lib/pickupDate.ts`), fixed pickup location (Kebagusan) in `lib/fulfillment.ts`.

**Happy path:** browse menu → cart (localStorage, `lib/cart`) → checkout gate → Google sign-in → pickup date → review (phone captured here; Google gives no phone) → `POST /api/orders` recomputes amount from `menu_items`, creates `PENDING`, calls Finpay → hosted VA page → Finpay **webhook** flips to `PAID` → ops email → admin advances `BAKING → READY_FOR_PICKUP` (fires customer email) `→ PICKED_UP`.

## 8. Auth

- **Customer:** Google via **Supabase** (`@supabase/ssr`, cookie/PKCE). `/oauth/consent` starts it, `/auth/callback` exchanges the code. Server reads the verified user from cookies (`lib/supabase/server.getSupabaseUser`); order email/identity is **server-trusted, never client-supplied**.
- **Identity resolver:** `lib/identity.getRequester()` — Supabase user only; the legacy **mock session is dev-only** and ignored once Supabase is configured (`/api/auth/mock-signin` returns 404 in prod).
- **Admin:** shared password (`ADMIN_PASSWORD`) → HMAC signed cookie (`lib/adminAuth`, `timingSafeEqual`), 12h. `/admin/*` gated per-route/page.

## 9. Payments — Finpay Hosted Payment (PG)

- **Production live** (`live.finnet.co.id`), Basic auth `base64(MID:key)`. `lib/finpay.ts` = `initiate` / `checkStatus` / `cancelOrder` / `refundOrder` / signature helpers.
- **Payment truth = the webhook, never the redirect.** `/api/finpay/callback`: verify **HMAC-SHA512 over raw body minus `signature`** (string surgery, not re-encode) → cross-check via **Check Status** (only act if they agree) → amount-match guard → idempotent on final/duplicate → `store.setStatus(PAID, "webhook")` → ops email.
- Methods restricted to **Virtual Account** (`DEFAULT_SOURCE_OF_FUNDS = "vabca"`); *actual* method visibility also depends on Finpay **MID** enablement (dashboard).
- Amount is **always server-recomputed** from `menu_items`; client totals ignored.

## 10. Integrations

- **Resend** (`lib/notify.ts`): ops-paid, customer ready-for-pickup, feedback + wholesale notifications. HTML-escaped inputs.
- **Cloudflare Turnstile** (`lib/captcha.ts` + `app/_components/Captcha.tsx`): on feedback + wholesale forms; graceful no-op until keys set.
- **WhatsApp:** plain `wa.me` deep links (no API), incl. admin phone links `wa.me/62<number, leading 0 stripped>`.

## 11. API surface (`finpay-backend/app/api/**`)

`POST /api/orders`, `GET /api/orders/[id]` (owner-scoped, PII-free `PublicOrder`), `GET /api/orders/mine`, `POST /api/finpay/callback`, `GET /api/menu`, `POST|GET /api/feedback`, `POST /api/wholesale`, `POST /api/admin/login`, `POST /api/admin/orders/[id]/{advance,cancel,refund}`, `POST /api/admin/wholesale/[id]/followup`, `GET /auth/callback`. Page routes: `/`, `/order` (opens drawer), `/order/[id]` (status, owner-scoped), `/orders`, `/menu` `/feedback` `/b2b` (section deep-links), `/oauth/consent`, `/admin`, `/admin/wholesale`, `/admin/bake-sheet`, `/admin/orders/[id]`, `/admin/login`.

## 12. Frontend / landing

- Full marketing landing rebuilt as React in `app/_components/landing/*`: nav (theme cycle + Classic/Playful + EN/ID + cart + auth), hero, story, **menu (DB-driven)**, mood quiz ("Find Your Match" → deep-links to cart), what's-inside, treat, order section, **B2B/wholesale + tasting modal**, **feedback showcase** (rating strip + animated 2-row marquee wall from the `feedback` table; ≤6 reviews → 1 row, >6 → 2 rows split with odd leftover on row 1), footer, first-visit theme picker.
- **The order flow is a single slide-over drawer** (`app/_components/OrderDrawer.tsx`) driven by `lib/order-flow/OrderFlowContext`. State via React Context: `CartContext`, `AuthContext`, `OrderFlowContext`, `LandingContext` (lang/theme). i18n dict in `lib/i18n/strings.ts` (EN/ID); 4 bg themes + Playful in `lib/landing/themes.ts`.
- Admin UI: pickup queue (by pickup date), order detail (advance/cancel/refund), bake sheet, wholesale table.

## 13. Security posture

Server-side price recompute; webhook HMAC + check-status + amount-match + idempotency; **owner-scoped order reads** returning whitelisted `publicOrderView` (no PII/`callback_log`) — closes the IDOR since order ids are enumerable; **per-IP in-memory rate limiter** (`lib/rateLimit`) + **honeypot** + Turnstile on public forms; `httpOnly`/`sameSite=lax` cookies (CSRF-safe); secrets only in Vercel env. Known Low items still open: admin-password length timing side-channel; `/auth/callback` `next` param only checks `startsWith('/')`.

## 14. Conventions

- **Store pattern:** each table gets a `*Store` with a Postgres impl + file/seed fallback behind one interface; `init()` is idempotent (`CREATE … IF NOT EXISTS`).
- **`main` = production.** Committing/pushing `main` triggers a prod deploy. Branch first for risky work; open a PR. End commit messages with the Co-Authored-By trailer.
- Prices/amounts: recompute server-side, never trust the client. Payment state: webhook only.
- No ORM, no Redis/queue, no CI, no reconciliation cron yet (webhook + manual). Rate limiter is per-instance (mitigation, not global).

## 15. Pending / next candidates

- **Supabase → Auth → URL Configuration:** whitelist `https://nobitesleft.com/**` + `www` as Redirect URLs + set Site URL — **required for Google sign-in on the live domain** (verify it's done; if sign-in fails, this is why).
- **Finpay dashboard:** enable **VA-only** on the MID; do a **small real transaction** to prove live payments end-to-end.
- **Turnstile keys** → set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` to activate captcha.
- Nice-to-haves: reconciliation job (PENDING→EXPIRED sweep + missed-webhook recheck), WhatsApp automated notifications, real-average on the review strip (currently static "4.9 / 200+"), the two Low security items.

## 16. Rollback levers

- **Whole site:** `vercel domains add nobitesleft.com no-bites-left-landing --force` (+ www) → back to old static landing; or Vercel Instant Rollback on `nbl-order`.
- **Finpay → sandbox:** set `FINPAY_BASE_URL` back to `https://devo.finnet.co.id` + sandbox key, redeploy.
