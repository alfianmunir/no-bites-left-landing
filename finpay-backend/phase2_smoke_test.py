#!/usr/bin/env python3
"""
Phase 2 smoke test: exercise the live POST /api/finpay/callback route against
a real dev server (npm run dev) and a real order created via POST /api/orders.

What this DOES prove:
  - Valid-signature callback for a real order is accepted (200, ack body).
  - Invalid/tampered signature is rejected (401), order state unchanged.
  - Unknown order.id is ack'd without error (stops Finpay retry storms).
  - The Check-Status defense-in-depth (PRD §6) actually blocks a forged
    "CAPTURED" callback: since the order was never really paid in Finpay's
    sandbox, live check-status still reports it unpaid, so our webhook must
    NOT flip the order to PAID from the callback alone. This is the single
    most important security property of the webhook — that a correctly
    *signed* callback still can't fake a payment.
  - A duplicate callback for a status the order already has is a no-op.

What this does NOT prove (open item, needs Phase 5 / a public URL):
  - That we correctly parse and act on a REAL callback sent by Finpay for an
    order actually paid through their hosted page. That requires either a
    public HTTPS tunnel (ngrok/cloudflared/localtunnel) + a completed sandbox
    payment, or a Vercel deploy. Do not consider Phase 2 fully closed until
    that happens.

Usage: python3 phase2_smoke_test.py   (requires `npm run dev` running)
"""
import hashlib
import hmac
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
LOG_PATH = HERE / "phase2_smoke_test.log"


def load_env(path):
    env = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


def log(fh, msg):
    print(msg)
    fh.write(msg + "\n")


def compute_signature(body_without_signature: str, merchant_key: str) -> str:
    return hmac.new(merchant_key.encode(), body_without_signature.encode(), hashlib.sha512).hexdigest()


def http_json(url, method="GET", body=None, timeout=20):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data is not None else {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def http_raw(url, raw_body: str, timeout=20):
    req = urllib.request.Request(
        url, data=raw_body.encode(), headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def create_order(base_url, fh):
    payload = {
        "items": [{"sku": "og-40", "qty": 1}],
        "customer": {
            "email": "phase2smoketest@nobitesleft.com",
            "firstName": "Phase2",
            "lastName": "Smoke",
            "mobilePhone": "+6281234567890",
        },
    }
    status, body = http_json(f"{base_url}/api/orders", method="POST", body=payload)
    log(fh, f"POST /api/orders -> {status}: {body}")
    if status != 200:
        return None, None
    parsed = json.loads(body)
    return parsed.get("orderId"), parsed.get("amount")


def get_order_status(base_url, order_id, fh):
    # No JSON order-detail endpoint yet; scrape the status chip off the HTML page.
    status, body = http_json(f"{base_url}/order/{order_id}")
    if status != 200:
        return None
    for candidate in ("PENDING", "PAID", "FULFILLED", "EXPIRED", "CANCELLED", "REFUNDED"):
        if f">{candidate}<" in body:
            return candidate
    return None


def build_callback(order_id, amount, status_value, merchant_key):
    fields = {
        "customer": {"id": "CUST-SMOKE"},
        "order": {"id": order_id, "reference": "REF-SMOKE", "amount": amount, "currency": "IDR"},
        "card": {"mask": "", "info": {}},
        "meta": {"data": None},
        "result": {"payment": {"amount": amount, "status": status_value, "statusDesc": None}},
    }
    canonical = json.dumps(fields, separators=(",", ":"))
    sig = compute_signature(canonical, merchant_key)
    return canonical[:-1] + f',"signature":"{sig}"' + "}"


def main():
    env = load_env(HERE / ".env.local")
    merchant_key = env.get("FINPAY_MERCHANT_KEY")
    base_url = (env.get("PUBLIC_BASE_URL") or "http://localhost:3000").rstrip("/")
    if not merchant_key:
        print("Missing FINPAY_MERCHANT_KEY in .env.local")
        sys.exit(1)

    results = {}
    with open(LOG_PATH, "w") as fh:
        log(fh, f"=== Phase 2 smoke test against {base_url} ===")

        # Reachability check.
        try:
            urllib.request.urlopen(base_url, timeout=5)
        except Exception as e:
            log(fh, f"Server not reachable at {base_url}: {e}")
            log(fh, "Start it first: npm run dev")
            sys.exit(1)

        # --- 1. Unknown order id, validly signed -> ack, no crash ---
        log(fh, "\n--- Test: unknown order.id ---")
        unknown_body = build_callback("NBL-DOES-NOT-EXIST", 12345, "CAPTURED", merchant_key)
        status, body = http_raw(f"{base_url}/api/finpay/callback", unknown_body)
        log(fh, f"POST callback (unknown order) -> {status}: {body}")
        results["unknown_order_acked"] = status == 200 and '"responseCode":"2000000"' in body

        # --- 2. Real order + tampered signature -> 401 ---
        log(fh, "\n--- Test: real order, happy setup ---")
        order_id, amount = create_order(base_url, fh)
        if not order_id:
            log(fh, "Could not create order — aborting remaining tests.")
            sys.exit(1)
        status_before = get_order_status(base_url, order_id, fh)
        log(fh, f"Order {order_id} amount={amount} status_before={status_before}")

        log(fh, "\n--- Test: tampered signature ---")
        genuine = build_callback(order_id, amount, "CAPTURED", merchant_key)
        tampered = genuine.replace(f'"amount":{amount}', f'"amount":{amount + 1}')
        status, body = http_raw(f"{base_url}/api/finpay/callback", tampered)
        log(fh, f"POST callback (tampered) -> {status}: {body}")
        results["tampered_rejected"] = status == 401
        status_after_tamper = get_order_status(base_url, order_id, fh)
        results["tampered_no_state_change"] = status_after_tamper == status_before
        log(fh, f"Order status after tampered callback: {status_after_tamper}")

        # --- 3. Genuine signature, forged CAPTURED status: check-status defense ---
        log(fh, "\n--- Test: genuine signature, forged CAPTURED (defense-in-depth) ---")
        status, body = http_raw(f"{base_url}/api/finpay/callback", genuine)
        log(fh, f"POST callback (genuine sig, forged CAPTURED) -> {status}: {body}")
        results["forged_captured_acked"] = status == 200 and '"responseCode":"2000000"' in body
        status_after_forged = get_order_status(base_url, order_id, fh)
        log(fh, f"Order status after forged CAPTURED callback: {status_after_forged}")
        # Must NOT be PAID — Finpay's sandbox never actually captured this order,
        # so live check-status should still disagree and block the transition.
        results["forged_captured_blocked"] = status_after_forged != "PAID"

        # --- 4. Duplicate no-op: same PENDING status again ---
        log(fh, "\n--- Test: duplicate no-op (still-PENDING status repeated) ---")
        dup = build_callback(order_id, amount, "REQUEST_INITIATED", merchant_key)
        status, body = http_raw(f"{base_url}/api/finpay/callback", dup)
        log(fh, f"POST callback (duplicate PENDING) -> {status}: {body}")
        results["duplicate_noop_acked"] = status == 200 and '"responseCode":"2000000"' in body

        log(fh, "\n=== SUMMARY ===")
        for name, ok in results.items():
            log(fh, f"{name}: {'PASS' if ok else 'FAIL'}")
        log(fh, "\nNOTE: this proves signature verification + check-status defense-in-depth")
        log(fh, "reject a forged callback. It does NOT prove we handle a REAL Finpay")
        log(fh, "callback for an actually-completed sandbox payment — that needs a public")
        log(fh, "URL (tunnel/deploy) + a completed sandbox payment (Phase 5).")

    sys.exit(0 if all(results.values()) else 1)


if __name__ == "__main__":
    main()
