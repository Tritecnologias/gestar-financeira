import { requirePermission } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function AuthorizedLayout({ children }: { children: React.ReactNode }) {
  try { await requirePermission("estrutura.financeiras.view"); }
  catch { redirect("/acesso-negado"); }
  return children;
}
