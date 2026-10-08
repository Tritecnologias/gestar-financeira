import { redirect } from "next/navigation";
import { hasPermission, requirePermission } from "@/lib/permissions";
import ConfiguracoesClient from "@/components/access/ConfiguracoesClient";

export default async function ConfiguracoesPage() {
  try {
    const context = await requirePermission("sistema.configuracoes.view");
    return <ConfiguracoesClient canManage={context.session.papel !== "membro" &&
      await hasPermission("sistema.configuracoes.manage", context)} />;
  } catch { redirect("/acesso-negado"); }
}
