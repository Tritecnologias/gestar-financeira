/** Presentation of existing guards; never grants permissions or replaces server checks. */
export function adminNavigation(context: {
  authMode?: "identity" | "legacy";
  platformAdmin?: boolean;
  hasMembership?: boolean;
  membershipRole?: "OWNER" | "ADMIN" | "MEMBER";
  legacyRole?: string;
  permissions: readonly string[];
}) {
  const identityMember = context.authMode === "identity" && context.hasMembership === true;
  const legacyTenant = context.authMode === "legacy";
  const tenantAdmin = identityMember && ["OWNER", "ADMIN"].includes(context.membershipRole ?? "") ||
    legacyTenant && ["admin", "admin_global"].includes(context.legacyRole ?? "");
  const allowed = new Set(context.permissions);
  const items = [
    { href: "/acessos/assessoria", label: "Acesso de Assessoria", permission: "acessos.assessoria.view", eligible: identityMember },
    { href: "/acessos", label: "Acessos / Usuários", permission: "acessos.usuarios.view", eligible: tenantAdmin },
    { href: "/acessos/perfis", label: "Perfis de Acesso", permission: "acessos.perfis.view", eligible: tenantAdmin },
    { href: "/acessos/auditoria", label: "Auditoria do Sistema", permission: "acessos.auditoria.view", eligible: tenantAdmin },
    { href: "/configuracoes", label: "Configurações", permission: "sistema.configuracoes.view", eligible: identityMember || legacyTenant },
    { href: "/backups", label: "Backup e Restauração", permission: "sistema.backup.view", eligible: identityMember },
  ].filter(item => item.eligible && allowed.has(item.permission));
  return { platform: context.authMode === "identity" && context.platformAdmin === true, items };
}
