import { redirect } from "next/navigation";
import { hasPermission, requireTenantPermission } from "@/lib/permissions";
import MembershipClient from "@/components/access/MembershipClient";

export default async function AcessosPage() {
  try {
    const context = await requireTenantPermission("acessos.usuarios.view");
    return <MembershipClient role={context.session.membershipRole ?? "ADMIN"}
      canManage={await hasPermission("acessos.usuarios.manage", context)}
      canViewProfiles={await hasPermission("acessos.perfis.view", context)} />;
  } catch { redirect("/acesso-negado"); }
}
