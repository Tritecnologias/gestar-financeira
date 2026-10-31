export type PlatformTenant = { id: string; nome: string; slug: string; email: string; plano: string; ativo: boolean;
  _count: { memberships: number }; activeOwnerCount: number; lastOwnerDesignationAt: string | null;
  contractualResponsibleMembershipId: string | null; contractualResponsibleReady: boolean; contractualStatus: string };
export type PlatformIdentity = { id: string; nome: string; email: string; status: string;
  platformAdmin: { status: string } | null; memberships: { id: string; role: string; status: string; tenant: { id: string; nome: string } }[] };
export type PlatformMembership = { id: string; role: string; status: string; identity: { id: string; nome: string; email: string };
  tenant: { id: string; nome: string }; profile: { id: string; nome: string } | null };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();

/** Full authorized catalog, independent of search and expansion. A membership is not a new user. */
export function platformIndicators(tenants: PlatformTenant[], identities: PlatformIdentity[], memberships: PlatformMembership[]) {
  const accounts = [...new Map(identities.map(i => [i.id, i])).values()];
  const linked = new Set(memberships.map(m => m.identity.id));
  return {
    tenants: tenants.length,
    users: accounts.length,
    activeTenants: tenants.filter(t => t.ativo).length,
    inactiveTenants: tenants.filter(t => !t.ativo).length,
    activeUsers: accounts.filter(i => i.status === "ACTIVE").length,
    inactiveUsers: accounts.filter(i => i.status === "INACTIVE").length,
    unlinkedUsers: accounts.filter(i => !linked.has(i.id)).length,
    withoutOwner: tenants.filter(t => t.activeOwnerCount === 0).length,
    pendingResponsible: tenants.filter(t => t.contractualStatus === "Responsável Contratual pendente").length,
    awaitingAcceptance: tenants.filter(t => t.contractualStatus === "Aguardando aceite").length,
  };
}

/** Read-only view model joined by stable IDs, never by names, emails or new identities. */
export function platformHierarchy(tenants: PlatformTenant[], identities: PlatformIdentity[], memberships: PlatformMembership[], query: string) {
  const search = normalize(query), accountById = new Map(identities.map(i => [i.id, i]));
  const memberByTenant = new Map<string, PlatformMembership[]>(), linked = new Set<string>();
  for (const m of memberships) { const group = memberByTenant.get(m.tenant.id) ?? []; group.push(m); memberByTenant.set(m.tenant.id, group); linked.add(m.identity.id); }
  const matches = (...fields: (string | undefined)[]) => !search || normalize(fields.join(" ")).includes(search);
  const groups = tenants.flatMap(tenant => {
    const all = memberByTenant.get(tenant.id) ?? [];
    const tenantMatch = matches(tenant.id, tenant.nome, tenant.slug, tenant.email, tenant.plano, tenant.ativo ? "Ativo" : "Inativo");
    const shown = tenantMatch ? all : all.filter(m => matches(m.id, m.identity.id, m.identity.nome, m.identity.email, m.role, m.status, m.profile?.nome ?? "Sem perfil"));
    return !tenantMatch && !shown.length ? [] : [{ tenant, memberships: shown, totalMemberships: all.length }];
  });
  const unlinked = identities.filter(i => !linked.has(i.id) && matches(i.id, i.nome, i.email, i.status,
    i.platformAdmin?.status === "ACTIVE" ? "PlatformAdmin Administrador da Plataforma" : ""));
  return { groups, unlinked, accountById };
}
