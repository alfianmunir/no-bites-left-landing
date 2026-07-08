/** POST /api/admin/ops/receive — create + receive a purchase (Ops Phase 1). */
import { NextResponse } from "next/server";
import { isOpsUser } from "@/lib/adminAuth";
import { opsEnabled, receivePurchase, type ReceiveLineInput } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

interface Body {
  supplierId?: string | null;
  supplierName?: string | null;
  invoiceRef?: string | null;
  orderedAt?: string | null;
  lines?: Array<{ itemId?: string; qty?: number | string; unitCost?: number | string; expiryDate?: string | null }>;
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isOpsUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  const lines: ReceiveLineInput[] = [];
  for (const l of rawLines) {
    const itemId = typeof l.itemId === "string" ? l.itemId : "";
    const qty = Number(l.qty);
    const unitCost = Number(l.unitCost);
    if (!itemId) continue; // skip blank rows
    if (!Number.isFinite(qty) || qty <= 0) return NextResponse.json({ error: "each line needs a quantity greater than 0" }, { status: 400 });
    if (!Number.isFinite(unitCost) || unitCost < 0) return NextResponse.json({ error: "each line needs a valid unit cost" }, { status: 400 });
    lines.push({ itemId, qty, unitCost, expiryDate: l.expiryDate || null });
  }
  if (lines.length === 0) return NextResponse.json({ error: "add at least one line with an item and quantity" }, { status: 400 });

  try {
    const result = await receivePurchase({
      supplierId: body.supplierId || null,
      supplierName: body.supplierName || null,
      invoiceRef: body.invoiceRef || null,
      orderedAt: body.orderedAt || null,
      lines,
    });
    logOrder("ops_receive", { purchaseId: result.purchaseId, lineCount: lines.length });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logOrder("ops_receive_failed", { error: String(e) });
    return NextResponse.json({ error: "Receive failed — check the items and try again." }, { status: 500 });
  }
}
