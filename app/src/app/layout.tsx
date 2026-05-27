import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestar Financeira – SaaS Financeiro",
  description: "Sistema de Fluxo de Caixa e Gestão Financeira para pequenas e médias empresas.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
