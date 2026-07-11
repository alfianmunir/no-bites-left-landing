/** POST /api/admin/ops/order — record a manual channel order (OMS quick-entry). */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, createSalesOrder, logActivity, type SalesLineInput } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

const idr = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

export const runtime = "nodejs";

interface Body {
  channelId?: string;
  customerRef?: string | null;
  orderedAt?: string | null;
  source?: string | null;
  lines?: Array<{ productId?: string; qty?: number | string; unitPrice?: number | string }>;
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const channelId = typeof body.channelId === "string" ? body.channelId : "";
  if (!channelId) return NextResponse.json({ error: "select a channel" }, { status: 400 });

  const lines: SalesLineInput[] = [];
  for (const l of Array.isArray(body.lines) ? body.lines : []) {
    const productId = typeof l.productId === "string" ? l.productId : "";
    const qty = Number(l.qty);
    const unitPrice = Number(l.unitPrice);
    if (!productId) continue;
    if (!Number.isFinite(qty) || qty <= 0) return NextResponse.json({ error: "each line needs a quantity greater than 0" }, { status: 400 });
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return NextResponse.json({ error: "each line needs a valid price" }, { status: 400 });
    lines.push({ productId, qty, unitPrice });
  }
  if (lines.length === 0) return NextResponse.json({ error: "add at least one product line" }, { status: 400 });

  try {
    const result = await createSalesOrder({
      channelId,
      customerRef: body.customerRef || null,
      orderedAt: body.orderedAt || null,
      source: body.source || null,
      lines,
    });
    logOrder("ops_order_create", { salesOrderId: result.salesOrderId, invoiceId: result.invoiceId, lineCount: lines.length });
    const gross = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const who = body.customerRef?.trim() || "walk-in";
    await logActivity({
      kind: "order_create",
      messageEn: `Order recorded — ${who} · ${idr(gross)}${result.invoiceId ? " · invoice raised" : ""}`,
      messageId: `Pesanan tersimpan — ${who} · ${idr(gross)}${result.invoiceId ? " · faktur dibuat" : ""}`,
      tone: "#2d9322",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logOrder("ops_order_create_failed", { error: String(e) });
    return NextResponse.json({ error: "Could not record the order — try again." }, { status: 500 });
  }
}
