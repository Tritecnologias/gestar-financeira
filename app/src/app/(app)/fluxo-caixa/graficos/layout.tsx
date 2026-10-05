import { requirePermission } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function AuthorizedLayout({ children }: { children: React.ReactNode }) {
  try { await requirePermission("fluxo.analises.view"); }
  catch { redirect("/acesso-negado"); }
  return children;
}
