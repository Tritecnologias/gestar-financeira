/** Permissions for shipped screens only. Keys are stable; labels can evolve. */
export const ACCESS_CATALOG = [
  { id: "acao", label: "Ação", screens: [
    { id: "tarefas", label: "Tarefas", href: "/acao/tarefas", actions: [
      ["view", "Visualizar"],
    ] },
  ] },
  { id: "estrutura", label: "Estrutura Empresa", screens: [
    { id: "empresa", label: "Dimensão da Empresa", href: "/estrutura/dimensao-empresa", actions: [["view", "Visualizar"]] },
    { id: "pessoas", label: "Dimensão de Pessoas", href: "/estrutura/dimensao-pessoas", actions: [["view", "Visualizar"]] },
    { id: "financeiras", label: "Dimensões Financeiras", href: "/estrutura/dimensoes-financeiras", actions: [["view", "Visualizar"]] },
    { id: "cadastrais", label: "Dimensões Cadastrais", href: "/estrutura/dimensoes-cadastrais", actions: [["view", "Visualizar"]] },
    { id: "portfolio", label: "Dimensão de Portfólio", href: "/estrutura/dimensao-produtos", actions: [["view", "Visualizar"]] },
    { id: "comerciais", label: "Dimensões Comerciais", href: "/estrutura/dimensoes-comerciais", actions: [["view", "Visualizar"]] },
  ] },
  { id: "fluxo", label: "Fluxo de Caixa", screens: [
    { id: "visao", label: "Visão Geral", href: "/fluxo-caixa/dashboards", actions: [
      ["view", "Visualizar"], ["saldos", "Visualizar saldos"],
    ] },
    { id: "lancamentos", label: "Lançamentos", href: "/lancamentos", actions: [
      ["view", "Visualizar"], ["create", "Criar"], ["edit", "Editar"],
      ["delete", "Excluir"], ["import", "Importar"], ["export", "Exportar"],
      ["bulk_edit", "Editar em massa"],
    ] },
    { id: "relatorios", label: "Relatórios", href: "/fluxo-caixa/relatorios", actions: [["view", "Visualizar"]] },
    { id: "analises", label: "Análises", href: "/fluxo-caixa/graficos", actions: [["view", "Visualizar"]] },
  ] },
  { id: "acessos", label: "Acessos", screens: [
    { id: "usuarios", label: "Usuários", href: "/acessos", actions: [["view", "Visualizar"], ["manage", "Administrar"]] },
    { id: "perfis", label: "Perfis de Acesso", href: "/acessos/perfis", actions: [["view", "Visualizar"], ["manage", "Administrar"]] },
  ] },
  { id: "sistema", label: "Sistema", screens: [
    { id: "configuracoes", label: "Configurações", href: "/configuracoes", actions: [["view", "Visualizar"], ["manage", "Alterar logo"]] },
  ] },
] as const;

export const ALL_PERMISSIONS = ACCESS_CATALOG.flatMap(module =>
  module.screens.flatMap(screen => screen.actions.map(([action]) => `${module.id}.${screen.id}.${action}`)));

export const PERMISSION_SET: ReadonlySet<string> = new Set(ALL_PERMISSIONS);

export function normalizedPermissions(input: unknown): string[] {
  if (!Array.isArray(input) || input.some(value => typeof value !== "string" || !PERMISSION_SET.has(value))) {
    throw Object.assign(new Error("Permissões inválidas."), { status: 400 });
  }
  const result = [...new Set(input as string[])];
  for (const key of result) {
    if (key.endsWith(".view")) continue;
    const view = `${key.slice(0, key.lastIndexOf("."))}.view`;
    if (!result.includes(view)) throw Object.assign(new Error(`Ação ${key} exige visualizar a tela.`), { status: 400 });
  }
  return result;
}

export function viewPermissionForPath(pathname: string): string | null {
  for (const module of ACCESS_CATALOG) {
    for (const screen of module.screens) {
      if (pathname === screen.href || pathname.startsWith(`${screen.href}/`)) {
        return `${module.id}.${screen.id}.view`;
      }
    }
  }
  return null;
}
