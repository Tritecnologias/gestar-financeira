import type { Metadata } from "next";
import OverviewClient from "./OverviewClient";
import "./overview.css";

export const metadata: Metadata = { title: "Visão Geral – Dez Soluções" };

export default function Page() {
  const hoje = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return <OverviewClient hoje={hoje} />;
}
