import type { Metadata } from "next";
import "./globals.css";
import AppearanceProvider from "@/components/appearance/AppearanceProvider";

export const metadata: Metadata = {
  title: "Dez Soluções – SaaS Financeiro",
  description: "Sistema de Fluxo de Caixa e Gestão Financeira para pequenas e médias empresas.",
  icons: {
    icon: [{ url: "/favicon.svg?v=dez-blue-1", type: "image/svg+xml", sizes: "any" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning><AppearanceProvider>{children}</AppearanceProvider></body>
    </html>
  );
}
