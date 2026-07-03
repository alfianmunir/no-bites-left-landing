#!/usr/bin/env python3
"""
Phase 0 smoke test: confirm Finpay sandbox credentials work end-to-end for
`initiate`, and validate the callback-signature verification approach against
synthetic payloads (real callback validation happens in Phase 2 once we have
a public webhook URL for Finpay to actually call).
"""
import base64
import hashlib
import hmac
import json
import random
import re
import string
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
LOG_PATH = HERE / "phase0_smoke_test.log"


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


def make_order_id():
    ts = int(time.time())
    rand = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"NBL-{ts}-{rand}"[:30]


def redact_headers(headers):
    return {k: ("Basic ***REDACTED***" if k.lower() == "authorization" else v) for k, v in headers.items()}


def initiate_smoke_test(env, fh):
    merchant_id = env["FINPAY_MERCHANT_ID"]
    merchant_key = env["FINPAY_MERCHANT_KEY"]
    base_url = env["FINPAY_BASE_URL"]

    order_id = make_order_id()
    payload = {
        "order": {
            "id": order_id,
            "amount": "35000",
            "currency": "IDR",
            "description": "No Bites Left — Apple Pie x1 (Phase 0 smoke test)",
            "timeout": 60,
        },
        "customer": {
            "email": "smoketest@nobitesleft.com",
            "firstName": "Smoke",
            "lastName": "Test",
            "mobilePhone": "+6281234567890",
        },
        "url": {
            "successUrl": "https://nobitesleft.com/order/" + order_id + "?result=success",
            "failUrl": "https://nobitesleft.com/order/" + order_id + "?result=fail",
            "backUrl": "https://nobitesleft.com/order/" + order_id,
            "callbackUrl": "https://nobitesleft.com/api/finpay/callback",
        },
    }

    auth_raw = f"{merchant_id}:{merchant_key}".encode()
    auth_b64 = base64.b64encode(auth_raw).decode()
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Basic {auth_b64}",
    }

    url = f"{base_url}/pg/payment/card/initiate"
    body_bytes = json.dumps(payload).encode()

    log(fh, "=== Phase 0: initiate smoke test ===")
    log(fh, f"POST {url}")
    log(fh, f"Headers: {json.dumps(redact_headers(headers))}")
    log(fh, f"Body: {json.dumps(payload, indent=2)}")

    req = urllib.request.Request(url, data=body_bytes, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            status = resp.status
            resp_body = resp.read().decode()
    except urllib.error.HTTPError as e:
        status = e.code
        resp_body = e.read().decode()
    except urllib.error.URLError as e:
        log(fh, f"CONNECTION FAILED: {e}")
        return False, order_id

    log(fh, f"Response status: {status}")
    log(fh, f"Response body: {resp_body}")

    ok = False
    try:
        parsed = json.loads(resp_body)
        code = parsed.get("responseCode")
        has_redirect = bool(parsed.get("redirecturl"))
        ok = status == 200 and code == "2000000" and has_redirect
        log(fh, f"responseCode={code} redirecturl_present={has_redirect}")
    except json.JSONDecodeError:
        log(fh, "Response was not valid JSON")

    log(fh, f"RESULT: {'PASS' if ok else 'FAIL'}")
    return ok, order_id


def strip_signature_field(raw_body: bytes) -> bytes:
    """
    Remove the top-level "signature":"..." field from a raw JSON body via
    string surgery (not parse+re-dump) so we HMAC byte-identical content to
    what Finpay signed, per PRD §6's warning about re-serialization mismatches.
    """
    text = raw_body.decode("utf-8")

    # Remove just the key-value pair itself, wherever it sits in the object.
    text = re.sub(r'"signature"\s*:\s*"[^"]*"', "", text, count=1)

    # Clean up whatever comma is now dangling next to the removed field:
    # ",}" -> "}"   (signature was last field)
    # "{," -> "{"   (signature was first field)
    # ",,"  -> ","  (signature was a middle field)
    text = re.sub(r",\s*}", "}", text)
    text = re.sub(r"{\s*,", "{", text)
    text = re.sub(r",\s*,", ",", text)

    return text.encode("utf-8")


def compute_signature(body_without_signature: bytes, merchant_key: str) -> str:
    return hmac.new(merchant_key.encode(), body_without_signature, hashlib.sha512).hexdigest()


def signature_selftest(env, fh):
    log(fh, "\n=== Phase 0: callback signature self-test (synthetic payload) ===")
    merchant_key = env["FINPAY_MERCHANT_KEY"]

    fields = {
        "customer": {"id": "CUST-1"},
        "order": {"id": "NBL-1234567890-ABCDEF", "reference": "REF-1", "amount": 35000, "currency": "IDR"},
        "card": {"mask": "", "info": {}},
        "meta": {"data": None},
        "result": {"payment": {"amount": 35000, "status": "CAPTURED", "statusDesc": None}},
    }

    # Simulate Finpay's side: they compute HMAC over json_encode(fields-without-signature),
    # then send us that same JSON PLUS the signature field appended.
    canonical_without_sig = json.dumps(fields, separators=(",", ":"))
    expected_sig = compute_signature(canonical_without_sig.encode(), merchant_key)

    # Build the raw body as Finpay would send it: fields + signature, in the
    # exact byte layout we'll receive (not re-derived from our own dict).
    raw_body = canonical_without_sig[:-1] + f',"signature":"{expected_sig}"' + "}"
    raw_body_bytes = raw_body.encode()

    log(fh, f"Synthetic raw callback body: {raw_body}")

    # Now run OUR verification path: strip signature via string surgery, HMAC, compare.
    stripped = strip_signature_field(raw_body_bytes)
    log(fh, f"Stripped body (should equal canonical_without_sig): {stripped.decode()}")

    recomputed_sig = compute_signature(stripped, merchant_key)
    match_stripped = stripped == canonical_without_sig.encode()
    match_sig = hmac.compare_digest(recomputed_sig, expected_sig)

    log(fh, f"Stripped body byte-identical to pre-signature canonical form: {match_stripped}")
    log(fh, f"Recomputed signature matches expected: {match_sig}")

    # Negative case: tampered payload must NOT verify.
    tampered = raw_body.replace('"amount":35000', '"amount":1')
    tampered_stripped = strip_signature_field(tampered.encode())
    tampered_sig = compute_signature(tampered_stripped, merchant_key)
    tampered_should_fail = not hmac.compare_digest(tampered_sig, expected_sig)
    log(fh, f"Tampered payload correctly fails verification: {tampered_should_fail}")

    ok = match_stripped and match_sig and tampered_should_fail
    log(fh, f"RESULT: {'PASS' if ok else 'FAIL'}")
    return ok


def main():
    env_path = HERE / ".env.local"
    env = load_env(env_path)
    missing = [k for k in ("FINPAY_MERCHANT_ID", "FINPAY_MERCHANT_KEY", "FINPAY_BASE_URL") if not env.get(k)]
    if missing:
        print(f"Missing env vars: {missing}")
        sys.exit(1)

    with open(LOG_PATH, "w") as fh:
        initiate_ok, order_id = initiate_smoke_test(env, fh)
        sig_ok = signature_selftest(env, fh)
        log(fh, f"\n=== SUMMARY ===")
        log(fh, f"initiate: {'PASS' if initiate_ok else 'FAIL'} (order_id={order_id})")
        log(fh, f"signature self-test: {'PASS' if sig_ok else 'FAIL'}")

    sys.exit(0 if (initiate_ok and sig_ok) else 1)


if __name__ == "__main__":
    main()
