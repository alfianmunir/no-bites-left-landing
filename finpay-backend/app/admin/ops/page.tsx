import { redirect } from "next/navigation";

export const runtime = "nodejs";

/** The Ops group opens on the Today dashboard. */
export default function OpsIndexPage() {
  redirect("/admin/ops/today");
}
