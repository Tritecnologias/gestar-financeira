import type { Metadata } from "next";
import RelatoriosClient from "./RelatoriosClient";
import "./relatorios.css";

export const metadata: Metadata = { title: "Relatórios – Dez Soluções" };

export default function Page() {
  const hoje = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return <RelatoriosClient hoje={hoje} />;
}
