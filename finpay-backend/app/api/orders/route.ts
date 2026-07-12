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
import { getMenuStore } from "@/lib/menuStore";
import { getCourierOption } from "@/lib/courier";
import { isValidDeliveryDate } from "@/lib/deliveryDate";
import { isValidPickupDate } from "@/lib/pickup";
import { getPickupLocationStore } from "@/lib/pickupLocationStore";
import { FULFILLMENT } from "@/lib/fulfillment";
import { generateOrderId } from "@/lib/orders";
import type { OrderItem, Customer, DeliveryAddress, CourierChoice } from "@/lib/orders";
import { initiate } from "@/lib/finpay";
import { logOrder } from "@/lib/log";
import { getRequester } from "@/lib/identity";

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
  pickupDate?: unknown; // v1 PICKUP
  pickupLocationId?: unknown; // v1 multi-location
  // v2 DELIVERY (ignored while FULFILLMENT === "PICKUP"):
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

  // --- identity: login is required at checkout (PRD §4.2). Email + name come
  //     from the server-verified Supabase user, never the client. The mock
  //     session is a dev fallback when Supabase isn't configured. The only
  //     client-supplied contact field is the mobile phone (no address form in
  //     pickup — Google doesn't provide a phone). ---
  const identity = await getRequester();
  if (!identity) return NextResponse.json({ error: "sign in required" }, { status: 401 });

  const rawCustomer = (body.customer ?? {}) as Record<string, unknown>;
  const nameParts = identity.name.trim().split(/\s+/);
  const { customer, error: custErr } = validateCustomer({
    email: identity.email,
    firstName: nameParts[0] || "Guest",
    lastName: nameParts.slice(1).join(" ") || "-",
    mobilePhone: typeof rawCustomer.mobilePhone === "string" ? rawCustomer.mobilePhone : "",
  });
  if (!customer) return badRequest(custErr!);

  // --- fulfillment: PICKUP (v1) vs DELIVERY (v2, dormant behind the flag) ---
  let pickupDate: string | null = null;
  let pickupLocationId: string | null = null;
  let pickupLocation: { name: string; area: string } | null = null;
  let deliveryDate: string | null = null;
  let address: DeliveryAddress | null = null;
  let courier: CourierChoice | null = null;

  if (FULFILLMENT === "DELIVERY") {
    // v2 path — address + courier + delivery date. Kept for a flag-flip; not
    // exercised in v1.
    const { address: addr, error: addrErr } = validateDeliveryAddress(body.deliveryAddress);
    if (!addr) return badRequest(addrErr!);
    address = addr;

    const courierCode = typeof body.courierCode === "string" ? body.courierCode.trim() : "";
    const courierOption = getCourierOption(courierCode);
    if (!courierOption) return badRequest(`unknown courierCode: ${courierCode}`);
    courier = {
      code: courierOption.code,
      name: courierOption.name,
      fee: courierOption.fee,
      etaLabel: courierOption.etaLabel,
    };

    const dd = typeof body.deliveryDate === "string" ? body.deliveryDate.trim() : "";
    if (!dd || !isValidDeliveryDate(dd)) return badRequest(`invalid deliveryDate: ${dd}`);
    deliveryDate = dd;
  } else {
    // v1 PICKUP path — pickup location + rule-aware pickup date. No address, no
    // courier, no delivery fee (E2E PRD §1a). Total is items only. The server
    // never trusts the client date/location — it re-resolves the location and
    // re-validates the date against that location's rule + the lead floor.
    const locId = typeof body.pickupLocationId === "string" ? body.pickupLocationId.trim() : "";
    const locStore = getPickupLocationStore();
    await locStore.init();
    const loc = await locStore.get(locId);
    if (!loc || !loc.active || loc.rule.type === "external") {
      return badRequest(`invalid pickupLocationId: ${locId}`);
    }
    const settings = await locStore.getSettings();
    const pd = typeof body.pickupDate === "string" ? body.pickupDate.trim() : "";
    if (!pd || !isValidPickupDate(loc.rule, pd, new Date(), settings.sameDayCutoffWib)) {
      return badRequest(`invalid pickupDate: ${pd}`);
    }
    pickupDate = pd;
    pickupLocationId = loc.id;
    pickupLocation = { name: loc.name, area: loc.area };
  }

  // --- validate cart & recompute amount server-side ---
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return badRequest("items must be a non-empty array");
  }
  if (body.items.length > MAX_LINES) {
    return badRequest(`too many line items (max ${MAX_LINES})`);
  }

  // Load the server-side menu (price source of truth) and index by SKU.
  const menuStore = getMenuStore();
  await menuStore.init();
  const menu = await menuStore.list();
  const bySku = new Map(menu.map((m) => [m.sku, m]));

  // Merge duplicate SKUs, validate each against the menu.
  const qtyBySku = new Map<string, number>();
  for (const rawLine of body.items as CartLineInput[]) {
    const sku = typeof rawLine?.sku === "string" ? rawLine.sku.trim() : "";
    const qty = Number(rawLine?.qty);
    if (!isNonEmptyString(sku)) return badRequest("each item needs a sku");
    if (!Number.isInteger(qty) || qty <= 0 || qty > MAX_QTY_PER_LINE) {
      return badRequest(`invalid qty for ${sku} (1-${MAX_QTY_PER_LINE})`, { sku });
    }
    const m = bySku.get(sku);
    if (!m || !m.available || m.unitPrice == null) {
      return badRequest(`unknown or unavailable sku: ${sku}`, { sku });
    }
    qtyBySku.set(sku, (qtyBySku.get(sku) ?? 0) + qty);
  }

  const items: OrderItem[] = [];
  let amount = 0;
  for (const [sku, qty] of qtyBySku) {
    const m = bySku.get(sku)!;
    amount += m.unitPrice! * qty;
    items.push({ sku, name: m.variant ? `${m.name} (${m.variant})` : m.name, qty, unit_price: m.unitPrice! });
  }
  if (amount <= 0) return badRequest("order amount must be positive");
  // v1 PICKUP: items only, no shipping fee. v2 DELIVERY folds the server-side
  // courier fee in (never a client-sent fee).
  if (courier) amount += courier.fee;

  // --- create PENDING order ---
  const store = getStore();
  await store.init();
  const orderId = generateOrderId();
  await store.create({
    id: orderId,
    items,
    amount,
    customer,
    status: "PENDING",
    fulfillment: FULFILLMENT,
    pickupDate,
    pickupLocationId,
    pickupLocation,
    deliveryAddress: address,
    deliveryDate,
    courier,
    userId: identity.id,
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
