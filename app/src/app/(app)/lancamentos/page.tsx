import type { Metadata } from "next";
import LancamentosClient from "@/components/lancamentos/LancamentosClient";

export const metadata: Metadata = {
  title: "Lançamentos – Dez Soluções",
  description: "Gestão de lançamentos financeiros com edição inline",
};

export default function LancamentosPage() {
  const hoje = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <LancamentosClient hoje={hoje} />;
}
