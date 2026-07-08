import { redirect } from "next/navigation";
import { getOpsSession } from "@/lib/adminAuth";
import LoginForm from "./LoginForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  // Already signed in? Send them to their home. This also means a staff member
  // who hits a super-admin-only page (which redirects here) is forwarded on to
  // their own dashboard rather than shown a login form.
  const session = await getOpsSession();
  if (session?.role === "super_admin") redirect("/admin");
  if (session?.role === "staff") redirect("/admin/ops/today");

  return <LoginForm />;
}
