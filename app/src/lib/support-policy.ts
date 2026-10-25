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
export const SUPPORT_ACTIONS = ["view", "create", "edit", "import"] as const;

export function validSupportModules(value: unknown): value is SupportModule[] {
  return Array.isArray(value) && value.length > 0 && value.length <= Object.keys(SUPPORT_MODULES).length &&
    value.every((item: unknown) => typeof item === "string" && Object.hasOwn(SUPPORT_MODULES, item)) &&
    new Set(value).size === value.length;
}

export function supportPermissions(modules: readonly SupportModule[], level: SupportAccessLevel): Set<string> {
  const permissions = new Set<string>();
  if (!validSupportModules(modules) || !["READ_ONLY", "OPERATIONAL"].includes(level)) return permissions;
  for (const module of modules) {
    const prefix = SUPPORT_MODULES[module].permission;
    permissions.add(`${prefix}.view`);
    if (level === "OPERATIONAL") for (const action of ["create", "edit", "import"]) permissions.add(`${prefix}.${action}`);
  }
  return permissions;
}

export function supportRequestAllowed(path: string, method: string, modules: readonly SupportModule[], level: SupportAccessLevel) {
  if (!validSupportModules(modules) || !["READ_ONLY", "OPERATIONAL"].includes(level)) return false;
  if (path === "/api/access/context" && method === "GET") return true;
  if (method !== "GET" && level !== "OPERATIONAL") return false;
  const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
  for (const module of modules) {
    const surface = SUPPORT_MODULES[module];
    if (method === "GET" && path === surface.page) return true;
    for (const api of surface.api) {
      if (api === "/api/estrutura-gerencial" || api === "/api/estrutura-financeira") {
        if (method === "POST" && level === "OPERATIONAL" && path === `${api}/importar`) return true;
        continue; // Export, new descendants and unreviewed actions stay closed.
      }
      if (path === api && (method === "GET" || method === "POST" && level === "OPERATIONAL")) return true;
      if (new RegExp(`^${api}/${uuid}$`).test(path) &&
          (method === "GET" || ["PUT", "PATCH"].includes(method) && level === "OPERATIONAL")) return true;
      if (method === "GET" && api === "/api/plano-contas" && path === `${api}/proximo-codigo`) return true;
    }
  }
  return false;
}

export function supportStatus(status: string, expiresAt: Date | null, now = new Date()) {
  return status === "ACTIVE" && expiresAt && expiresAt <= now ? "EXPIRED" : status;
}
