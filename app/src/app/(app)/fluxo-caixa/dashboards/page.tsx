import type { Metadata } from "next";
import OverviewClient from "./OverviewClient";
import "./overview.css";
import { requirePermission } from "@/lib/permissions";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Visão Geral – Dez Soluções" };

export default async function Page() {
  try { await requirePermission("fluxo.visao.view"); }
  catch (error: any) { redirect(error?.status === 403 ? "/acesso-negado" : "/login"); }
  const hoje = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return <OverviewClient hoje={hoje} />;
}
