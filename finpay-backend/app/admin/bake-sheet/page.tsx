/**
 * Legacy bake-sheet route — the bake sheet now lives in the ops menu.
 * Redirect to /admin/ops/bake-sheet (preserving the ?date= selection).
 */
import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LegacyBakeSheetPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  redirect(date ? `/admin/ops/bake-sheet?date=${date}` : "/admin/ops/bake-sheet");
}
