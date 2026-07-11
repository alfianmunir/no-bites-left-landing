/** POST /api/admin/ops/invoice — update a B2B invoice's AR status. */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, setInvoiceStatus, logActivity } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

const INV_EN: Record<string, string> = { paid: "paid", sent: "sent", void: "voided", draft: "draft", overdue: "overdue" };
const INV_ID: Record<string, string> = { paid: "lunas", sent: "terkirim", void: "dibatalkan", draft: "draf", overdue: "terlambat" };

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: { invoiceId?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const invoiceId = typeof body.invoiceId === "string" ? body.invoiceId : "";
  const status = typeof body.status === "string" ? body.status : "";
  if (!invoiceId) return NextResponse.json({ error: "missing invoice" }, { status: 400 });

  try {
    const ok = await setInvoiceStatus(invoiceId, status);
    if (!ok) return NextResponse.json({ error: "invoice not found" }, { status: 404 });
    logOrder("ops_invoice_status", { invoiceId, status });
    await logActivity({
      kind: "invoice_status",
      messageEn: `B2B invoice ${INV_EN[status] ?? status}`,
      messageId: `Faktur B2B ${INV_ID[status] ?? status}`,
      tone: status === "paid" ? "#2d9322" : status === "void" ? "#6f5c45" : "#d98b1e",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = String(e).includes("invalid invoice status") ? "invalid status" : "Update failed — try again.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
