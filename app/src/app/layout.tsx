import type { Metadata } from "next";
import "./globals.css";
import AppearanceProvider from "@/components/appearance/AppearanceProvider";
import EnvironmentIdentityProvider from "@/components/identity/EnvironmentIdentity";
import { homologIdentity, environmentIconPaths } from "@/lib/environment-identity";

export const dynamic = "force-dynamic";
export function generateMetadata(): Metadata {
  const icons = environmentIconPaths(homologIdentity());
  return {
  title: "Dez Soluções – SaaS Financeiro",
  description: "Sistema de Fluxo de Caixa e Gestão Financeira para pequenas e médias empresas.",
  icons: {
    icon: [{ url: icons.svg, type: "image/svg+xml", sizes: "any" }, { url: icons.ico, type: "image/x-icon", sizes: "16x16 32x32 48x48" }],
  },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning><EnvironmentIdentityProvider homolog={homologIdentity()}><AppearanceProvider>{children}</AppearanceProvider></EnvironmentIdentityProvider></body>
    </html>
  );
}
