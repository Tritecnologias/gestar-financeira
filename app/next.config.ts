import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Output standalone para Docker (reduz tamanho da imagem)
  output: "standalone",

  // Prisma precisa rodar no servidor
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "bcryptjs"],

  // Disable x-powered-by header por segurança
  poweredByHeader: false,
};

export default nextConfig;
