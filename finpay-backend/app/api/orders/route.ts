/**
 * POST /api/orders
 *
 * PRD §4/§5/§13: validate cart against the server-side price list, recompute
 * the amount (never trust the client), create a PENDING order, call Finpay
 * initiate, and return the redirect URL. The client sends only SKUs + qty +
 * customer details — any client-supplied total is ignored.
 */
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getStore } from "@/lib/db";
import { getPriceItem } from "@/lib/prices";
import { getCourierOption } from "@/lib/courier";
import { isValidDeliveryDate } from "@/lib/deliveryDate";
import { generateOrderId } from "@/lib/orders";
import type { OrderItem, Customer, DeliveryAddress, CourierChoice } from "@/lib/orders";
import { initiate } from "@/lib/finpay";
import { logOrder } from "@/lib/log";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORDER_TIMEOUT_MINUTES = 60; // PRD §5: ~60 min
const MAX_QTY_PER_LINE = 100;
const MAX_LINES = 30;

interface CartLineInput {
  sku?: unknown;
  qty?: unknown;
}
interface OrderRequestBody {
  items?: unknown;
  customer?: unknown;
  deliveryAddress?: unknown;
  courierCode?: unknown;
  deliveryDate?: unknown;
}

function badRequest(message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status: 400 });
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function validateCustomer(raw: unknown): { customer?: Customer; error?: string } {
  if (!raw || typeof raw !== "object") return { error: "customer is required" };
  const c = raw as Record<string, unknown>;
  const email = typeof c.email === "string" ? c.email.trim() : "";
  const firstName = typeof c.firstName === "string" ? c.firstName.trim() : "";
  const lastName = typeof c.lastName === "string" ? c.lastName.trim() : "";
  const mobilePhone = typeof c.mobilePhone === "string" ? c.mobilePhone.trim() : "";

  if (!isNonEmptyString(email) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "valid customer.email is required" };
  }
  if (!isNonEmptyString(firstName)) return { error: "customer.firstName is required" };
  // lastName may be empty for mononym customers; default to a placeholder so
  // Finpay always gets a non-empty value.
  if (!isNonEmptyString(mobilePhone) || !/^\+?[0-9]{8,15}$/.test(mobilePhone)) {
    return { error: "valid customer.mobilePhone is required (8-15 digits, optional +)" };
  }
  return {
    customer: {
      email,
      firstName: firstName.slice(0, 40),
      lastName: (lastName || "-").slice(0, 40),
      mobilePhone: mobilePhone.startsWith("+") ? mobilePhone : `+${mobilePhone}`,
    },
  };
}

function validateDeliveryAddress(raw: unknown): { address?: DeliveryAddress; error?: string } {
  if (!raw || typeof raw !== "object") return { error: "deliveryAddress is required" };
  const a = raw as Record<string, unknown>;
  const recipientName = typeof a.recipientName === "string" ? a.recipientName.trim() : "";
  const phone = typeof a.phone === "string" ? a.phone.trim() : "";
  const area = typeof a.area === "string" ? a.area.trim() : "";
  const fullAddress = typeof a.fullAddress === "string" ? a.fullAddress.trim() : "";
  const notes = typeof a.notes === "string" ? a.notes.trim() : undefined;
  if (!recipientName || !phone || !area || !fullAddress) {
    return { error: "deliveryAddress requires recipientName, phone, area, and fullAddress" };
  }
  return { address: { recipientName, phone, area, fullAddress, notes: notes || undefined } };
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: OrderRequestBody;
  try {
    body = (await req.json()) as OrderRequestBody;
  } catch {
    return badRequest("invalid JSON body");
  }

  // --- validate customer ---
  const { customer, error: custErr } = validateCustomer(body.customer);
  if (!customer) return badRequest(custErr!);

  // --- validate delivery address ---
  const { address, error: addrErr } = validateDeliveryAddress(body.deliveryAddress);
  if (!address) return badRequest(addrErr!);

  // --- validate courier: recompute fee server-side, never trust a client fee ---
  const courierCode = typeof body.courierCode === "string" ? body.courierCode.trim() : "";
  const courierOption = getCourierOption(courierCode);
  if (!courierOption) return badRequest(`unknown courierCode: ${courierCode}`);
  const courier: CourierChoice = {
    code: courierOption.code,
    name: courierOption.name,
    fee: courierOption.fee,
    etaLabel: courierOption.etaLabel,
  };

  // --- validate delivery date: must be >= H+3 and within an open capacity window ---
  const deliveryDate = typeof body.deliveryDate === "string" ? body.deliveryDate.trim() : "";
  if (!deliveryDate || !isValidDeliveryDate(deliveryDate)) {
    return badRequest(`invalid deliveryDate: ${deliveryDate}`);
  }

  // --- validate cart & recompute amount server-side ---
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return badRequest("items must be a non-empty array");
  }
  if (body.items.length > MAX_LINES) {
    return badRequest(`too many line items (max ${MAX_LINES})`);
  }

  // Merge duplicate SKUs, validate each against the price list.
  const qtyBySku = new Map<string, number>();
  for (const rawLine of body.items as CartLineInput[]) {
    const sku = typeof rawLine?.sku === "string" ? rawLine.sku.trim() : "";
    const qty = Number(rawLine?.qty);
    if (!isNonEmptyString(sku)) return badRequest("each item needs a sku");
    if (!Number.isInteger(qty) || qty <= 0 || qty > MAX_QTY_PER_LINE) {
      return badRequest(`invalid qty for ${sku} (1-${MAX_QTY_PER_LINE})`, { sku });
    }
    if (!getPriceItem(sku)) {
      return badRequest(`unknown sku: ${sku}`, { sku });
    }
    qtyBySku.set(sku, (qtyBySku.get(sku) ?? 0) + qty);
  }

  const items: OrderItem[] = [];
  let amount = 0;
  for (const [sku, qty] of qtyBySku) {
    const p = getPriceItem(sku)!;
    amount += p.unitPrice * qty;
    items.push({ sku, name: `${p.name} (${p.variant})`, qty, unit_price: p.unitPrice });
  }
  if (amount <= 0) return badRequest("order amount must be positive");
  amount += courier.fee;

  // --- create PENDING order ---
  const session = await getSession();
  const store = getStore();
  await store.init();
  const orderId = generateOrderId();
  await store.create({
    id: orderId,
    items,
    amount,
    customer,
    status: "PENDING",
    deliveryAddress: address,
    deliveryDate,
    courier,
    userId: session?.id ?? null,
  });
  logOrder("created", { orderId, amount, lineCount: items.length });

  // --- call Finpay initiate ---
  const base = env.publicBaseUrl;
  const description = `No Bites Left order ${orderId} — ${items
    .map((i) => `${i.qty}x ${i.name}`)
    .join(", ")}`;

  const result = await initiate({
    orderId,
    amount,
    description,
    timeoutMinutes: ORDER_TIMEOUT_MINUTES,
    customer,
    items,
    successUrl: `${base}/order/${orderId}?from=success`,
    failUrl: `${base}/order/${orderId}?from=fail`,
    backUrl: `${base}/order/${orderId}?from=back`,
    callbackUrl: `${base}/api/finpay/callback`,
  });

  if (!result.ok || !result.redirectUrl) {
    logOrder("initiate_failed", { orderId, responseCode: result.responseCode, message: result.responseMessage });
    // Leave order PENDING; reconciliation/expiry will retire it. Surface a
    // 502 so the client can show a retry, without exposing Finpay internals.
    return NextResponse.json(
      { error: "payment initiation failed, please try again", orderId },
      { status: 502 },
    );
  }

  await store.update(orderId, {
    redirect_url: result.redirectUrl,
    expiry_link: result.expiryLinkIso,
    finpay_reference: result.traceId ?? null,
  });
  logOrder("initiated", { orderId, expiryLink: result.expiryLinkIso });

  return NextResponse.json({
    orderId,
    amount,
    redirectUrl: result.redirectUrl,
    expiryLink: result.expiryLinkIso,
  });
}
