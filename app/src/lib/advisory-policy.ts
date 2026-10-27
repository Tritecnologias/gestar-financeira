import { ACCESS_CATALOG, ALL_PERMISSIONS, normalizedPermissions } from "./access-catalog";

// Business actions only. Governance, credentials, support and backups are never delegated.
export const ADVISORY_PERMISSIONS = ALL_PERMISSIONS.filter(p => /^(acao|estrutura|fluxo)\./.test(p));
const allowed = new Set(ADVISORY_PERMISSIONS);
export const ADVISORY_CATALOG = ACCESS_CATALOG.filter(m => ["acao", "estrutura", "fluxo"].includes(m.id));
export function advisoryPermissions(input: unknown): string[] {
  const result = normalizedPermissions(input);
  if (!result.length || result.some(p => !allowed.has(p))) throw Object.assign(new Error("Selecione apenas permissões empresariais de assessoria."), { status: 400 });
  return result;
}
export function advisoryActive(g: { status: string; startsAt: Date; expiresAt: Date | null; revokedAt: Date | null }, now = new Date()) {
  return g.status === "ACTIVE" && !g.revokedAt && g.startsAt <= now && (!g.expiresAt || g.expiresAt > now);
}

/** Explicit reviewed API surfaces. Unknown descendants fail closed. Handler permissions still apply. */
export function advisoryRequestAllowed(path: string, method: string): boolean {
  if (!path.startsWith("/api/")) return path === "/inicio" || path === "/termos/aceite" ||
    ADVISORY_CATALOG.some(m => m.screens.some(s => s.href === path));
  if (method === "GET" && ["/api/access/context", "/api/terms/pending"].includes(path)) return true;
  if (path === "/api/terms/accept" && method === "POST") return true;
  const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
  if (method === "GET" && new RegExp(`^/api/terms/versions/${uuid}/file$`).test(path)) return true;
  const resources = "areas-negocio|centros-custo|categorias|clientes|dados-bancarios|dre|empresa|fornecedores|lancamentos|layouts|pessoas|plano-contas|produto-grupos|produto-linhas|produto-tipos|produtos|status-tipos|tarefas";
  if (new RegExp(`^/api/(${resources})(/${uuid})?$`).test(path)) return ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method);
  if (method === "GET" && ["/api/pessoas/proximo-codigo", "/api/plano-contas/proximo-codigo", "/api/fluxo-caixa/resumo", "/api/fluxo-caixa/relatorio", "/api/fluxo-caixa/analises", "/api/lancamentos/exportar", "/api/lancamentos/importacao-oficial/base"].includes(path)) return true;
  if (["/api/lancamentos/lote", "/api/lancamentos/edicao-em-massa", "/api/lancamentos/importacao-oficial"].includes(path)) return method === "POST";
  if (/^\/api\/(estrutura-financeira|estrutura-gerencial|dimensoes-cadastrais|pessoas|produtos)\/(importar|exportar)$/.test(path)) return path.endsWith("/importar") ? method === "POST" : method === "GET";
  if (["/api/tarefas/status", "/api/status-tipos/config"].includes(path)) return ["GET", "POST", "PUT"].includes(method);
  return false;
}
