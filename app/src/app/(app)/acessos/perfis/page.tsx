import { redirect } from "next/navigation";
import { hasPermission, requireTenantPermission } from "@/lib/permissions";
import ProfilesClient from "@/components/access/ProfilesClient";

export default async function PerfisPage() {
  try {
    const context = await requireTenantPermission("acessos.perfis.view");
    return <ProfilesClient canManage={await hasPermission("acessos.perfis.manage", context)} />;
  } catch { redirect("/acesso-negado"); }
}
