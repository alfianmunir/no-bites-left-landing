import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/adminAuth";
import { opsEnabled, listItemsWithStock } from "@/lib/opsStore";
import { OpsShell, DbNotice } from "../OpsChrome";
import ItemsPanel from "./ItemsPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OpsItemsPage() {
  if (!(await isAdminSession())) redirect("/admin/login");

  if (!opsEnabled) {
    return (
      <OpsShell active="/admin/ops/items" title="Items">
        <DbNotice />
      </OpsShell>
    );
  }

  const items = await listItemsWithStock();
  const goods = items.filter((i) => i.type === "ingredient").length;
  const packaging = items.filter((i) => i.type === "packaging").length;

  return (
    <OpsShell active="/admin/ops/items" title="Items" subtitle={`${goods} goods · ${packaging} packaging`}>
      <ItemsPanel items={items} />
    </OpsShell>
  );
}
