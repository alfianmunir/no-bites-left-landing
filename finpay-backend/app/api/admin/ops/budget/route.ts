/** POST /api/admin/ops/budget — expense-category / budget CRUD (Money → Budgets).
 *  Actions: create { code, name, type, monthlyBudget? } ·
 *  update { id, name?, monthlyBudget? (null clears) } · delete { id }. */
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, createExpenseCategory, updateExpenseCategory, deleteExpenseCategory } from "@/lib/opsStore";
import { logOrder } from "@/lib/log";

export const runtime = "nodejs";

const TYPES = ["opex", "marketing", "capex"] as const;
type CategoryType = (typeof TYPES)[number];

function parseBudget(v: unknown): number | null | undefined {
  if (v === undefined) return undefined; // not in patch
  if (v === null || v === "") return null; // explicit clear
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await isAdminSession())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!opsEnabled) return NextResponse.json({ error: "Ops requires a database connection (DATABASE_URL)." }, { status: 503 });

  let body: { action?: string; id?: string; code?: string; name?: string; type?: string; monthlyBudget?: unknown; countInkind?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "create": {
        const code = typeof body.code === "string" ? body.code.trim() : "";
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const type = TYPES.includes(body.type as CategoryType) ? (body.type as CategoryType) : null;
        if (!code || !/^[a-z0-9_]+$/.test(code)) return NextResponse.json({ error: "code must be lowercase letters/digits/underscores" }, { status: 400 });
        if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
        if (!type) return NextResponse.json({ error: "type must be opex | marketing | capex" }, { status: 400 });
        const budget = parseBudget(body.monthlyBudget);
        const id = await createExpenseCategory({ code, name, type, monthlyBudget: budget ?? null });
        logOrder("ops_budget_create", { id, code, type });
        return NextResponse.json({ ok: true, id });
      }
      case "update": {
        const id = typeof body.id === "string" ? body.id : "";
        if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
        const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : undefined;
        const budget = parseBudget(body.monthlyBudget);
        const countInkind = typeof body.countInkind === "boolean" ? body.countInkind : undefined;
        if (name === undefined && budget === undefined && countInkind === undefined) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
        await updateExpenseCategory(id, { name, monthlyBudget: budget, countInkind });
        logOrder("ops_budget_update", { id });
        return NextResponse.json({ ok: true });
      }
      case "delete": {
        const id = typeof body.id === "string" ? body.id : "";
        if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
        const result = await deleteExpenseCategory(id);
        if (result === "blocked") {
          return NextResponse.json({ error: "category has recorded expenses — clear its budget instead of deleting" }, { status: 409 });
        }
        logOrder("ops_budget_delete", { id });
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    const msg = String(e);
    if (msg.includes("duplicate key")) return NextResponse.json({ error: "that code already exists" }, { status: 409 });
    logOrder("ops_budget_failed", { error: msg });
    return NextResponse.json({ error: "request failed" }, { status: 500 });
  }
}
