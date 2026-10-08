import { redirect } from "next/navigation";
import { requireSupportApprover } from "@/lib/support-approval";
import SupportClient from "@/components/access/SupportClient";

export default async function TenantSupportPage() {
  try { await requireSupportApprover(); } catch { redirect("/acesso-negado"); }
  return <SupportClient mode="tenant" />;
}
