import type { Metadata } from "next";
import LancamentosClient from "@/components/lancamentos/LancamentosClient";
import { requirePermission } from "@/lib/permissions";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Lançamentos – Dez Soluções",
  description: "Gestão de lançamentos financeiros com edição inline",
};

export default async function LancamentosPage() {
  try { await requirePermission("fluxo.lancamentos.view"); }
  catch (error: any) { redirect(error?.status === 403 ? "/acesso-negado" : "/login"); }
  const hoje = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <LancamentosClient hoje={hoje} />;
}
