import type { Metadata } from "next";
import AnalisesClient from "./AnalisesClient";
import "./analises.css";

export const metadata: Metadata = { title: "Análises – Dez Soluções" };

export default function Page() {
  const hoje = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return <AnalisesClient hoje={hoje} />;
}
