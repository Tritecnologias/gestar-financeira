import { redirect } from "next/navigation";
import { requirePermission, hasPermission } from "@/lib/permissions";
import BackupClient from "@/components/backup/BackupClient";

export default async function BackupsPage() {
  try {
    const context = await requirePermission("sistema.backup.view");
    if (context.session.authMode !== "identity" || context.session.accessSource !== "MEMBERSHIP") redirect("/acesso-negado");
    return <BackupClient tenantId={context.session.tenantId} tenantName={context.session.tenantNome}
      canCreate={await hasPermission("sistema.backup.create", context)}
      canRestore={context.session.membershipRole === "OWNER" && await hasPermission("sistema.backup.restore", context)} />;
  } catch { redirect("/acesso-negado"); }
}
