import { redirect } from "next/navigation";
import { requireTenantPermission } from "@/lib/permissions";
import AuditClient from "@/components/access/AuditClient";

export default async function TenantAuditPage() {
  try { await requireTenantPermission("acessos.auditoria.view"); } catch { redirect("/acesso-negado"); }
  return <AuditClient mode="tenant" />;
}
