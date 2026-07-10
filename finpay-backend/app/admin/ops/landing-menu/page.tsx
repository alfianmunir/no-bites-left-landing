/**
 * /admin/ops/landing-menu — storefront (landing page) menu CRUD.
 *
 * Manages public.menu_items: the DB-driven catalog the landing page renders AND
 * the server-side price source of truth for POST /api/orders. Add items, edit
 * price / availability / copy (EN+ID), reorder, or delete. Works on the file
 * store too (dev preview; writes non-persistent there).
 */
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/adminAuth";
import { getMenuStore } from "@/lib/menuStore";
import { OpsShell } from "../OpsChrome";
import LandingMenuPanel from "./LandingMenuPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LandingMenuPage() {
  if (!(await isAdminSession())) redirect("/admin/login");

  const store = getMenuStore();
  await store.init();
  const items = await store.list();
  const orderable = items.filter((m) => m.available).length;

  return (
    <OpsShell active="/admin/ops/landing-menu" title="Landing menu" subtitle={`${items.length} items · ${orderable} orderable`}>
      <LandingMenuPanel items={items} />
    </OpsShell>
  );
}
