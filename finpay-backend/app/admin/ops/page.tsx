import { redirect } from "next/navigation";

export const runtime = "nodejs";

/** The Ops group opens on the Stock screen. */
export default function OpsIndexPage() {
  redirect("/admin/ops/stock");
}
