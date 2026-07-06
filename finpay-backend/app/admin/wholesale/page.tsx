import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminSession } from "@/lib/adminAuth";
import { getLeadStore } from "@/lib/leadStore";
import WholesaleTable from "./WholesaleTable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminWholesalePage() {
  if (!(await isAdminSession())) redirect("/admin/login");

  const store = getLeadStore();
  await store.init();
  const rows = await store.listWholesale();
  const pending = rows.filter((r) => !r.followedUp).length;

  return (
    <main style={{ maxWidth: 1040, margin: "0 auto", minHeight: "100dvh", background: "var(--surface2)" }}>
      <div style={{ padding: "18px 20px 8px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 18, color: "var(--choco)" }}>Wholesale requests</div>
          <div style={{ fontSize: 12.5, color: "var(--soft)", marginTop: 2 }}>{rows.length} total · {pending} to follow up</div>
        </div>
        <Link href="/admin" style={{ fontSize: 13, fontWeight: 800, color: "var(--soft)", textDecoration: "none" }}>‹ Pickup queue</Link>
      </div>
      <div style={{ padding: "8px 20px 40px" }}>
        <WholesaleTable initial={rows} />
      </div>
    </main>
  );
}
