import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/adminAuth";
import { getPickupLocationStore } from "@/lib/pickupLocationStore";
import { OpsShell } from "../OpsChrome";
import PickupLocationsPanel from "./PickupLocationsPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OpsPickupLocationsPage() {
  if (!(await isAdminSession())) redirect("/admin/login");

  const store = getPickupLocationStore();
  await store.init();
  const [locations, settings] = await Promise.all([store.list(), store.getSettings()]);
  const active = locations.filter((l) => l.active).length;

  return (
    <OpsShell active="/admin/ops/pickup-locations" title="Pickup spots" subtitle={`${active} active · ${locations.length} total`}>
      <PickupLocationsPanel initialLocations={locations} initialSettings={settings} />
    </OpsShell>
  );
}
