import type { Metadata } from "next";
import LancamentosClient from "@/components/lancamentos/LancamentosClient";

export const metadata: Metadata = {
  title: "Lançamentos – Gestar Financeira",
  description: "Gestão de lançamentos financeiros com edição inline",
};

export default function LancamentosPage() {
  return <LancamentosClient />;
}
