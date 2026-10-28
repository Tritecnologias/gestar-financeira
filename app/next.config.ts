import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Preserve the complete multipart envelope before the route enforces its
  // 10 MiB file / bounded-body limits. This is a buffer cap, not upload consent.
  experimental: { middlewareClientMaxBodySize: "11mb" },
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg", "bcryptjs"],
  // PDFs jurídicos são lidos de um volume privado em runtime, nunca do build.
  outputFileTracingExcludes: {
    "/*": [
      "**/next.config.ts", "**/.private/**/*", "**/.env*", "**/.git/**/*",
      "./scripts/**/*", "./tests/**/*", "./docs/**/*", "./src/**/*",
      "./Dockerfile", "./*.tsbuildinfo", "./prisma/seed*",
    ],
  },
  poweredByHeader: false,

  // Headers de segurança
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      { source: "/ativar-acesso", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/primeiro-acesso", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/api/access/invitations/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/api/platform/tenants/:id/owner-invitations", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};

export default nextConfig;
