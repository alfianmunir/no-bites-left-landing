# Phase 0 — Sandbox smoke test findings

**Date:** 3 Jul 2026
**Env:** sandbox (`https://devo.finnet.co.id`), MID `MAMAMM688`
**Result:** ✅ PASS — auth, `initiate`, signature verification approach, and `check-status` all confirmed working.

Run with: `python3 phase0_smoke_test.py` (reads `.env.local`, writes `phase0_smoke_test.log`).

---

## 1. Auth — confirmed

`Authorization: Basic base64(merchantId:merchantKey)` + `Content-Type/Accept: application/json`.
The provided sandbox keys authenticate successfully. No extra headers needed.

## 2. `POST /pg/payment/card/initiate` — confirmed

Request body that works (see `phase0_smoke_test.py`):
```json
{
  "order":    { "id": "NBL-<ts>-<rand>", "amount": "35000", "currency": "IDR",
                "description": "...", "timeout": 60 },
  "customer": { "email": "...", "firstName": "...", "lastName": "...",
                "mobilePhone": "+6281234567890" },
  "url":      { "successUrl": "...", "failUrl": "...", "backUrl": "...",
                "callbackUrl": "..." }
}
```

Real 200 response:
```json
{
  "responseCode": "2000000",
  "responseMessage": "Request has been processed successfully",
  "redirecturl": "https://devo.finpay.id/pg/payment/card/id/v2/access/<token>",
  "expiryLink": "2026-07-03 18:15:59",
  "processingTime": 0.088,
  "traceId": "5cb17219-..."
}
```

**Notes for later phases:**
- `redirecturl` host is `devo.finpay.id` (NOT `finnet.co.id`). Don't hardcode/validate the redirect host against the API base URL.
- `expiryLink` is a `"YYYY-MM-DD HH:MM:SS"` **local-time string** (looks like WIB/UTC+7 — it was ~60 min ahead of the request, matching our `timeout: 60`). Parse with the right tz when storing into the `expiry_link TIMESTAMPTZ` column. **Confirm the timezone with Finpay** before relying on it for expiry logic; reconciliation job is the safety net regardless.
- `traceId` is returned on every call — capture it in the request/response log (PRD rule §5) for support tickets.
- `amount` is sent as a **string** and echoed as integer elsewhere. Keep IDR as integer internally; stringify only at the initiate boundary.

## 3. `GET /pg/payment/card/check/{orderId}` — confirmed

Same Basic-auth header. Real 200 response for the just-created (unpaid) order:
```json
{
  "responseCode": "2000000",
  "data": {
    "merchant": { "id": "MAMAMM688" },
    "order": { "id": "NBL-...", "reference": "", "amount": 35000, "currency": "IDR" },
    "result": { "payment": {
      "status": "REQUEST_INITIATED",
      "statusDesc": "REQUEST_INITIATED",
      "userDesc": "Your transaction is currently in progress or pending processing",
      "amount": 0
    }}
  },
  "traceId": "386ca621-..."
}
```

**Payment status values observed / documented so far:**
| Status | Meaning | Maps to our status |
| --- | --- | --- |
| `REQUEST_INITIATED` | order created, not yet paid (observed) | `PENDING` |
| `CAPTURED` | paid (from docs sample) | `PAID` |
| _(expired/failed/cancelled/refunded values TBD)_ | — | confirm in Phase 2/5 |

⚠️ The full status enum is still **not** exhaustively confirmed (PRD §12 open item). Phase 2 mapping must be **tolerant**: treat known-paid values as PAID, known-terminal-failure values as EXPIRED/CANCELLED, and anything unrecognized as "leave unchanged + log for review" rather than guessing. Reconciliation + real sandbox payments (Phase 5) will fill this table in.

Note `check-status` echoes `result.payment.amount: 0` while unpaid — do **not** use that field for verification until captured; compare against `data.order.amount` instead.

## 4. Callback signature verification — approach validated (synthetic)

Cannot receive a real Finpay callback yet (no public URL until Phase 2 deploy). Self-test proves the mechanics:
- **Strip** the `"signature":"..."` field from the **raw** body via string surgery (regex), NOT parse→re-encode — per PRD §6, so we HMAC byte-identical content to what Finpay signed.
- `HMAC-SHA512(raw_body_without_signature, merchantKey)` → 128-char hex.
- Constant-time compare (`hmac.compare_digest`).
- Self-test confirms: byte-identical strip ✅, signature match ✅, tampered payload rejected ✅.

**Still must validate against a REAL sandbox callback in Phase 2** (highest-risk item, PRD §6/§12). The exact field ordering and whitespace Finpay uses in the signed body is the thing to verify — my synthetic test uses compact `separators=(",",":")` with signature appended last, which is a guess at their layout. Do not consider signature verification "done" until a real callback verifies.

---

## Open items carried into later phases
- [ ] **Node.js not installed on this machine** — blocks Phase 1 (Next.js scaffold) and all `npm`/`node` work. Needs install (or a decision to build on a different runtime). Flagged to Munir/user.
- [ ] Confirm enabled payment methods for MID `MAMAMM688` (QRIS + e-wallets priority) — Finpay dashboard / support (PRD §10 prereq).
- [ ] Confirm `expiryLink` timezone.
- [ ] Confirm full payment-status enum + callback retry policy with Finpay support (PRD §12).
- [ ] Decide: send `order.item[]` line items vs single `description` (PRD §12 open q).
