import { requirePermission } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function AuthorizedLayout({ children }: { children: React.ReactNode }) {
  try { await requirePermission("estrutura.portfolio.view"); }
  catch { redirect("/acesso-negado"); }
  return children;
}
