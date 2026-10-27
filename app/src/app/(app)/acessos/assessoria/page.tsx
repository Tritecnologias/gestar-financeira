import AdvisoryClient from "@/components/access/AdvisoryClient";
import { requirePermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
export default async function AdvisoryPage() {
  try { await requirePermission("acessos.assessoria.view"); } catch { redirect("/inicio"); }
  return <AdvisoryClient />;
}
