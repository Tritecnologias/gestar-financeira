import type { AuthIdentity, Prisma, MembershipRole } from "@prisma/client";
import { ALL_PERMISSIONS } from "@/lib/access-catalog";
import { writeAudit, type AuditInput } from "@/lib/audit";
import { normalizeEmail } from "@/lib/email";

type Tx = Prisma.TransactionClient;
type Actor = Pick<AuditInput, "actorIdentityId" | "platformAdminId" | "accessMode" | "metadata">;
const unavailable = (message: string) => Object.assign(new Error(message), { status: 409 });

/** Transaction primitives. The caller must validate its invitation/administrative authority.
 * These functions never commit, authenticate, accept terms or change existing credentials. */
export async function createPendingTenant(tx: Tx, input: { nome: string; slug: string; email: string; plano: string }, actor: Actor) {
  const created = await tx.tenant.create({
    data: { ...input, nome: input.nome.trim(), email: normalizeEmail(input.email), escolhaModalidadePendente: true },
    select: { id: true, nome: true, slug: true, email: true, plano: true },
  });
  await writeAudit(tx, { ...actor, action: "TENANT_CREATED", resourceType: "Tenant", resourceId: created.id,
    metadata: { ...actor.metadata, tenantName: created.nome, plan: created.plano } });
  return created;
}

export function initialAdministrationProfile(tx: Tx, tenantId: string) {
  return tx.accessProfile.upsert({ where: { tenantId_nome: { tenantId, nome: "ADMINISTRAÇÃO" } },
    create: { tenantId, nome: "ADMINISTRAÇÃO", descricao: "Perfil inicial de administração", permissoes: ALL_PERMISSIONS }, update: {} });
}

export async function activateTenantMembership(tx: Tx, input: {
  tenantId: string; identity: AuthIdentity; role: MembershipRole; profileId: string;
  ownerAssignment: { actorIdentityId: string; reason: string; metadata: NonNullable<AuditInput["metadata"]> };
}) {
  const { tenantId, identity, role, profileId, ownerAssignment } = input;
  const profile = await tx.accessProfile.findFirst({ where: { id: profileId, tenantId, ativo: true, tenant: { ativo: true } }, select: { id: true } });
  if (!profile || identity.status !== "ACTIVE") throw unavailable("Empresa ou perfil indisponível.");
  const existing = await tx.tenantMembership.findUnique({ where: { identityId_tenantId: { identityId: identity.id, tenantId } }, select: { id: true } });
  const legacy = await tx.usuario.findFirst({ where: { tenantId, email: identity.email }, select: { id: true } });
  if (existing || legacy) throw unavailable("Acesso já existente; solicite revisão ao administrador.");
  const membership = await tx.tenantMembership.create({ data: { tenantId, identityId: identity.id, role, profileId, status: "ACTIVE" } });
  const user = await tx.usuario.create({ data: { tenantId, nome: identity.nome, email: identity.email,
    senhaHash: identity.senhaHash, papel: role === "MEMBER" ? "membro" : "admin", ativo: true } });
  await tx.legacyUserAccessMap.create({ data: { tenantId, identityId: identity.id, membershipId: membership.id, legacyUsuarioId: user.id } });
  if (role === "OWNER") {
    await tx.accessOwnerEvent.create({ data: { tenantId, actorIdentityId: ownerAssignment.actorIdentityId,
      targetIdentityId: identity.id, targetMembershipId: membership.id, previousRole: null, previousStatus: null } });
    await writeAudit(tx, { tenantId, actorIdentityId: ownerAssignment.actorIdentityId, accessMode: "SYSTEM",
      action: "OWNER_ASSIGNED", resourceType: "TenantMembership", resourceId: membership.id,
      reason: ownerAssignment.reason, metadata: ownerAssignment.metadata });
  }
  return membership;
}
