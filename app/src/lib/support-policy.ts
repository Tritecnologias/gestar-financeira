import type { SupportAccessLevel, SupportModule } from "@prisma/client";

// Initial support surfaces are deliberately closed. Adding another module requires
// reviewing its page, API reads, authorship and writes before extending this map.
export const SUPPORT_MODULES = {
  ESTRUTURA_EMPRESA: { label: "Dimensão da Empresa", permission: "estrutura.empresa",
    page: "/estrutura/dimensao-empresa",
    api: ["/api/empresa", "/api/dados-bancarios", "/api/areas-negocio", "/api/centros-custo", "/api/estrutura-gerencial"] },
  ESTRUTURA_FINANCEIRA: { label: "Dimensões Financeiras", permission: "estrutura.financeiras",
    page: "/estrutura/dimensoes-financeiras",
    api: ["/api/categorias", "/api/plano-contas", "/api/estrutura-financeira"] },
} as const;

export const SUPPORT_MINUTES = { default: 60, min: 15, max: 1440 } as const;
export const SUPPORT_ACTIONS = ["view", "create", "edit", "import", "export"] as const;

export function validSupportModules(value: unknown): value is SupportModule[] {
  return Array.isArray(value) && value.length > 0 && value.length <= Object.keys(SUPPORT_MODULES).length &&
    value.every((item: unknown) => typeof item === "string" && item in SUPPORT_MODULES) &&
    new Set(value).size === value.length;
}

export function supportPermissions(modules: readonly SupportModule[], level: SupportAccessLevel): Set<string> {
  const permissions = new Set<string>();
  for (const module of modules) {
    const prefix = SUPPORT_MODULES[module].permission;
    permissions.add(`${prefix}.view`);
    permissions.add(`${prefix}.export`); // export is a read of the approved screen
    if (level === "OPERATIONAL") for (const action of ["create", "edit", "import"]) permissions.add(`${prefix}.${action}`);
  }
  return permissions;
}

function matches(path: string, base: string) { return path === base || path.startsWith(`${base}/`); }

export function supportRequestAllowed(path: string, method: string, modules: readonly SupportModule[], level: SupportAccessLevel) {
  if (path === "/api/access/context" || path === "/api/terms/pending" || path === "/api/terms/accept" ||
      path.startsWith("/api/terms/versions/") || path === "/termos/aceite") return true;
  if (method !== "GET" && level !== "OPERATIONAL") return false;
  for (const module of modules) {
    const surface = SUPPORT_MODULES[module];
    if (method === "GET" && matches(path, surface.page)) return true;
    if (surface.api.some(api => matches(path, api))) {
      if (method === "GET") return true;
      // Explicitly reviewed operational APIs; deletion stays outside ACCESS-5B.
      if (method === "POST" && !path.includes("/exportar")) return true;
      if ((method === "PATCH" || method === "PUT") &&
        (module === "ESTRUTURA_EMPRESA" || module === "ESTRUTURA_FINANCEIRA")) return true;
    }
  }
  return false;
}

export function supportStatus(status: string, expiresAt: Date | null, now = new Date()) {
  return status === "ACTIVE" && expiresAt && expiresAt <= now ? "EXPIRED" : status;
}
