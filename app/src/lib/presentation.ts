// Presentation only. API payloads, permissions, enums and audit codes stay intact.
const roles: Record<string, string> = { OWNER: "Proprietário", ADMIN: "Administrador", MEMBER: "Membro", admin: "Administrador", membro: "Membro", admin_global: "Administrador da Plataforma" };
const states: Record<string, string> = { ACTIVE: "Ativo", INACTIVE: "Inativo", PENDING: "Pendente", EXPIRED: "Expirado", ACCEPTED: "Aceito", REVOKED: "Revogado", REJECTED: "Rejeitado", DRAFT: "Rascunho", PUBLISHED: "Publicado", RETIRED: "Retirado de vigência", SENT: "Enviado", SIMULATED: "Simulado", FAILED: "Falha no envio", SUCCESS: "Concluído", DENIED: "Negado", FAILURE: "Falha", READ_ONLY: "Somente leitura", OPERATIONAL: "Operacional" };
const resources: Record<string, string> = { AuthIdentity: "Conta", Usuario: "Usuário", Tenant: "Empresa", TenantMembership: "Vínculo com a empresa", AccessProfile: "Perfil de acesso", PlatformAdmin: "Administrador da Plataforma", SupportOperator: "Operador de Suporte", SupportGrant: "Acesso Temporário de Suporte", AccessInvite: "Convite de acesso", TermDocument: "Documento", TermVersion: "Versão do documento", TermAcceptance: "Aceite de termo", TenantBackup: "Backup da empresa" };
const modes: Record<string, string> = { SYSTEM: "Sistema", MEMBERSHIP: "Vínculo com a empresa", PLATFORM_ADMIN: "Administração da Plataforma", SUPPORT_GRANT: "Acesso Temporário de Suporte" };
export const resourceOptions = Object.entries(resources);
export const roleLabel = (value: string) => roles[value] ?? "Não informado";
export const statusLabel = (value: string) => states[value] ?? "Não informado";
export const resourceLabel = (value: string) => resources[value] ?? "Registro";
export const accessModeLabel = (value: string) => modes[value] ?? "Sistema";
export const planLabel = (value: string) => ({ trial: "Período de teste", mensal: "Mensal", anual: "Anual" }[value] ?? "Não informado");
export function presentationValue(value: string) { return roles[value] ?? states[value] ?? resources[value] ?? modes[value] ?? value; }

// Error text from existing endpoints is adapted at the rendering boundary only.
export function messagePtBr(message: string) {
  const exact: Record<string, string> = { Forbidden: "Você não tem permissão para realizar esta ação.", Unauthorized: "Entre novamente para continuar.", "Membership inactive": "Seu vínculo com esta empresa está inativo.", "Identity inactive": "Esta conta está inativa.", "Failed to fetch": "Não foi possível conectar. Verifique sua conexão e tente novamente." };
  return exact[message] ?? message
    .replace(/\bNenhum tenant encontrado\b/g, "Nenhuma empresa encontrada")
    .replace(/\bTenant (inativo|ativo|inválido|selecionado)\b/g, (_, state: string) => `Empresa ${{ inativo: "inativa", ativo: "ativa", inválido: "inválida", selecionado: "selecionada" }[state]}`)
    .replace(/\bPlatformAdmin\b/g, "Administrador da Plataforma")
    .replace(/\bSupportOperator\b/g, "Operador de Suporte")
    .replace(/\bSupportGrant\b/g, "Acesso Temporário de Suporte")
    .replace(/\bMemberships?\b/gi, "vínculo com a empresa")
    .replace(/\b(?:do|no|ao) tenant\b/gi, part => ({ "do tenant": "da empresa", "no tenant": "na empresa", "ao tenant": "à empresa" }[part.toLowerCase()]!))
    .replace(/\b(?:o|um|este|esse|neste|deste) tenant\b/gi, part => ({ "o tenant": "a empresa", "um tenant": "uma empresa", "este tenant": "esta empresa", "esse tenant": "essa empresa", "neste tenant": "nesta empresa", "deste tenant": "desta empresa" }[part.toLowerCase()]!))
    .replace(/\btenants\b/gi, "empresas").replace(/\btenant\b/gi, "empresa")
    .replace(/\bOWNER\b/g, "Proprietário").replace(/\bADMIN\b/g, "Administrador").replace(/\bMEMBER\b/g, "Membro")
    .replace(/\bREAD_ONLY\b/g, "Somente leitura").replace(/\bOPERATIONAL\b/g, "Operacional")
    .replace(/\bINACTIVE\b/g, "Inativo").replace(/\bACTIVE\b/g, "Ativo");
}
