import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { acceptedUserTerms, contractualReadiness, requiredPublishedTerms } from "@/lib/contractual-state";
import { writeAudit, type AuditInput } from "@/lib/audit";
import { assertInviteRateLimit, inviteExpiresAt } from "@/lib/access-invites";
import { ALL_PERMISSIONS } from "@/lib/access-catalog";
import type { UserSession } from "@/types";
import { requireTenantModalityReady } from "@/lib/tenant-modality-state";

type Tx = Prisma.TransactionClient;
export type ContractualActor = { tenantId: string; identityId: string; membershipId: string };
function fail(message: string, status = 409): never { throw Object.assign(new Error(message), { status }); }
export function contractualActor(session: UserSession): ContractualActor {
  if (session.authMode !== "identity" || session.accessSource !== "MEMBERSHIP" ||
      session.membershipRole !== "OWNER" || !session.identityId || !session.membershipId) {
    return fail("Somente um Proprietário ativo desta empresa pode concluir esta etapa.", 403);
  }
  return { tenantId: session.tenantId, identityId: session.identityId, membershipId: session.membershipId };
}
export async function lockContractualTenant(tx: Tx, tenantId: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`contractual-onboarding:${tenantId}`}, 0))`;
}
export async function assertContractualOwnerActive(tx: Tx, actor: ContractualActor) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT m.id FROM tenant_memberships m
    JOIN auth_identities i ON i.id=m.identity_id JOIN tenants t ON t.id=m.tenant_id
    WHERE m.id=${actor.membershipId} AND m.identity_id=${actor.identityId} AND m.tenant_id=${actor.tenantId}
      AND m.role='OWNER' AND m.status='ACTIVE' AND i.status='ACTIVE' AND t.ativo
    FOR SHARE OF m,i,t`;
  if (rows.length !== 1) fail("Seu acesso de Proprietário não está mais ativo.", 403);
}
function event(actor: ContractualActor, action: string, resourceId: string, metadata?: AuditInput["metadata"]): AuditInput {
  return { tenantId: actor.tenantId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId,
    accessMode: "MEMBERSHIP", action, resourceType: "TenantContractualOnboarding", resourceId, metadata };
}
export async function cancelContractualNomination(tx: Tx, tenantId: string, actorIdentityId: string, reason: string) {
  const row = await tx.tenantContractualOnboarding.findUnique({ where: { tenantId }, include: { invitation: true } });
  if (!row || row.status === "CANCELLED") return;
  if (row.status === "PENDING" && row.invitation?.status === "PENDING") {
    await tx.accessInvite.update({ where: { id: row.invitation.id }, data: { status: "REVOKED", revokedAt: new Date(), revokedByIdentityId: actorIdentityId } });
    await writeAudit(tx, { tenantId, actorIdentityId, accessMode: "SYSTEM", action: "INVITE_REVOKED",
      resourceType: "AccessInvite", resourceId: row.invitation.id, reason });
  }
  await tx.tenantContractualOnboarding.update({ where: { tenantId }, data: { status: "CANCELLED", assignedMembershipId: null, assignedAt: null } });
  await writeAudit(tx, { tenantId, actorIdentityId, accessMode: "SYSTEM", action: "CONTRACTUAL_NOMINATION_CANCELLED",
    resourceType: "TenantContractualOnboarding", resourceId: tenantId, reason });
}
export async function linkReissuedContractualInvite(tx: Tx, tenantId: string, previousId: string, nextId: string, actorIdentityId: string) {
  const row = await tx.tenantContractualOnboarding.findUnique({ where: { tenantId } });
  if (!row || row.invitationId !== previousId || row.choice !== "OTHER" || row.status === "ASSIGNED") return;
  await tx.tenantContractualOnboarding.update({ where: { tenantId }, data: { invitationId: nextId, status: "PENDING" } });
  await writeAudit(tx, { tenantId, actorIdentityId, accessMode: "SYSTEM", action: "CONTRACTUAL_INVITE_REISSUED",
    resourceType: "TenantContractualOnboarding", resourceId: tenantId, metadata: { previousInviteId: previousId, invitationId: nextId } });
}
export async function markContractualInviteRevoked(tx: Tx, tenantId: string, invitationId: string, actorIdentityId: string) {
  const row = await tx.tenantContractualOnboarding.findUnique({ where: { tenantId } });
  if (!row || row.invitationId !== invitationId || row.status !== "PENDING") return;
  await tx.tenantContractualOnboarding.update({ where: { tenantId }, data: { status: "CANCELLED" } });
  await writeAudit(tx, { tenantId, actorIdentityId, accessMode: "SYSTEM", action: "CONTRACTUAL_INVITE_REVOKED",
    resourceType: "TenantContractualOnboarding", resourceId: tenantId, metadata: { invitationId } });
}
async function assign(tx: Tx, actor: ContractualActor) {
  await requireTenantModalityReady(tx, actor.tenantId);
  const previous = await tx.tenantContractualResponsible.findUnique({ where: { tenantId: actor.tenantId } });
  await tx.tenantContractualResponsible.upsert({ where: { tenantId: actor.tenantId },
    create: { tenantId: actor.tenantId, membershipId: actor.membershipId, assignedByIdentityId: actor.identityId },
    update: { membershipId: actor.membershipId, assignedByIdentityId: actor.identityId, assignedAt: new Date() } });
  await writeAudit(tx, { ...event(actor, "CONTRACTUAL_RESPONSIBLE_ASSIGNED", actor.tenantId),
    changes: { before: { membershipId: previous?.membershipId ?? null }, after: { membershipId: actor.membershipId } } });
}
/** Call only under the tenant lock; no assignment before the nominee's own USER acceptance. */
export async function finalizeContractualNomination(tx: Tx, actor: ContractualActor) {
  const row = await tx.tenantContractualOnboarding.findUnique({ where: { tenantId: actor.tenantId },
    include: { invitation: true } });
  if (!row || row.choice !== "OTHER" || row.status !== "PENDING" || !row.invitation) return false;
  const invite = row.invitation;
  if (invite.tenantId !== actor.tenantId || invite.role !== "OWNER" || invite.status !== "ACCEPTED" ||
      invite.acceptedByIdentityId !== actor.identityId) return false;
  await assertContractualOwnerActive(tx, actor);
  if (!await acceptedUserTerms(tx, actor.identityId)) return false;
  if ((await contractualReadiness(tx, actor.tenantId)).validResponsible) return false;
  await assign(tx, actor);
  await tx.tenantContractualOnboarding.update({ where: { tenantId: actor.tenantId },
    data: { status: "ASSIGNED", assignedMembershipId: actor.membershipId, assignedAt: new Date() } });
  return true;
}
export async function selfContractualResponsible(actor: ContractualActor) {
  return prisma.$transaction(async tx => {
    await lockContractualTenant(tx, actor.tenantId); await assertContractualOwnerActive(tx, actor);
    if (!await acceptedUserTerms(tx, actor.identityId)) fail("Aceite primeiro os Termos de Uso do Usuário.", 428);
    await requireTenantModalityReady(tx, actor.tenantId);
    const ready = await contractualReadiness(tx, actor.tenantId);
    if (ready.validResponsible) {
      if (ready.responsibleMembershipId === actor.membershipId) return { unchanged: true };
      fail("Esta empresa já possui um responsável contratual válido.");
    }
    const previous = await tx.tenantContractualOnboarding.findUnique({ where: { tenantId: actor.tenantId } });
    await cancelContractualNomination(tx, actor.tenantId, actor.identityId, "Escolha explícita do próprio Proprietário");
    if (!previous) await writeAudit(tx, event(actor, "CONTRACTUAL_ONBOARDING_STARTED", actor.tenantId));
    await writeAudit(tx, event(actor, "CONTRACTUAL_SELF_SELECTED", actor.tenantId));
    await assign(tx, actor);
    const data = { choice: "SELF" as const, status: "ASSIGNED" as const, initiatedByMembershipId: actor.membershipId,
      invitationId: null, assignedMembershipId: actor.membershipId, assignedAt: new Date() };
    await tx.tenantContractualOnboarding.upsert({ where: { tenantId: actor.tenantId },
      create: { tenantId: actor.tenantId, ...data }, update: data });
    return { unchanged: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
export async function nominateContractualResponsible(actor: ContractualActor, input: { email: string; name: string; tokenHash: string }) {
  return prisma.$transaction(async tx => {
    await lockContractualTenant(tx, actor.tenantId); await assertContractualOwnerActive(tx, actor);
    await requireTenantModalityReady(tx, actor.tenantId);
    if (!await acceptedUserTerms(tx, actor.identityId)) fail("Aceite primeiro os Termos de Uso do Usuário.", 428);
    if ((await contractualReadiness(tx, actor.tenantId)).validResponsible) fail("Esta empresa já possui um responsável contratual válido.");
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`access-invite:${actor.tenantId}:${input.email}`}, 0))`;
    const previous = await tx.tenantContractualOnboarding.findUnique({ where: { tenantId: actor.tenantId }, include: { invitation: true } });
    if (previous?.status === "PENDING" && previous.invitation?.status === "ACCEPTED") fail("A pessoa indicada já ativou o acesso. Aguarde seus aceites ou revise a indicação.");
    const identity = await tx.authIdentity.findUnique({ where: { email: input.email }, select: { id: true, status: true } });
    const alreadyMember = identity && await tx.tenantMembership.findUnique({ where: { identityId_tenantId: { identityId: identity.id, tenantId: actor.tenantId } }, select: { id: true } });
    const legacy = await tx.usuario.findFirst({ where: { tenantId: actor.tenantId, email: input.email }, select: { id: true } });
    if (alreadyMember || legacy || identity?.status === "INACTIVE") fail("Não foi possível emitir este convite. Confira o endereço e os acessos da empresa.");
    const pending = await tx.accessInvite.findFirst({ where: { tenantId: actor.tenantId, email: input.email, status: "PENDING", expiresAt: { gt: new Date() } } });
    if (pending && pending.id !== previous?.invitationId) fail("Já existe um convite pendente para essa pessoa nesta empresa.");
    await assertInviteRateLimit(tx, actor.tenantId, input.email);
    await cancelContractualNomination(tx, actor.tenantId, actor.identityId, "Nova indicação contratual explícita");
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: actor.tenantId }, select: { nome: true } });
    const profile = await tx.accessProfile.upsert({ where: { tenantId_nome: { tenantId: actor.tenantId, nome: "ADMINISTRAÇÃO" } },
      create: { tenantId: actor.tenantId, nome: "ADMINISTRAÇÃO", descricao: "Perfil inicial de administração", permissoes: ALL_PERMISSIONS }, update: {} });
    if (!profile.ativo) fail("O perfil de Proprietário está indisponível. Solicite revisão administrativa.");
    const invite = await tx.accessInvite.create({ data: { tenantId: actor.tenantId, email: input.email, name: input.name, role: "OWNER",
      profileId: profile.id, tokenHash: input.tokenHash, expiresAt: inviteExpiresAt(), invitedByIdentityId: actor.identityId } });
    const data = { choice: "OTHER" as const, status: "PENDING" as const, initiatedByMembershipId: actor.membershipId,
      invitationId: invite.id, assignedMembershipId: null, assignedAt: null };
    await tx.tenantContractualOnboarding.upsert({ where: { tenantId: actor.tenantId }, create: { tenantId: actor.tenantId, ...data }, update: data });
    if (!previous) await writeAudit(tx, event(actor, "CONTRACTUAL_ONBOARDING_STARTED", actor.tenantId));
    await writeAudit(tx, event(actor, "CONTRACTUAL_PERSON_NOMINATED", actor.tenantId, { invitationId: invite.id }));
    await writeAudit(tx, event(actor, "CONTRACTUAL_INVITE_CREATED", actor.tenantId, { invitationId: invite.id }));
    await writeAudit(tx, { ...event(actor, "INVITE_CREATED", invite.id, { role: "OWNER", purpose: "CONTRACTUAL_RESPONSIBLE" }), resourceType: "AccessInvite" });
    return { id: invite.id, status: invite.status, expiresAt: invite.expiresAt, tenantName: tenant.nome, profileName: profile.nome };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

export async function contractualInvitationAction(actor: ContractualActor, action: "resend" | "revoke", tokenHash?: string) {
  return prisma.$transaction(async tx => {
    await lockContractualTenant(tx, actor.tenantId); await assertContractualOwnerActive(tx, actor);
    if (!await acceptedUserTerms(tx, actor.identityId)) fail("Aceite primeiro os Termos de Uso do Usuário.", 428);
    if ((await contractualReadiness(tx, actor.tenantId)).validResponsible) fail("A designação contratual desta empresa já foi concluída.");
    const row = await tx.tenantContractualOnboarding.findUnique({ where: { tenantId: actor.tenantId },
      include: { invitation: { include: { tenant: { select: { nome: true, ativo: true } }, profile: { select: { nome: true, ativo: true } } } } } });
    const old = row?.invitation;
    if (!row || row.choice !== "OTHER" || row.status !== "PENDING" || !old || old.tenantId !== actor.tenantId || old.role !== "OWNER") fail("Indicação contratual indisponível.");
    if (old.status !== "PENDING" && old.status !== "EXPIRED") fail("Convite já concluído ou revogado.");
    if (action === "revoke") {
      if (old.status !== "PENDING" || old.expiresAt <= new Date()) fail("Somente um convite pendente e válido pode ser revogado.");
      await tx.accessInvite.update({ where: { id: old.id }, data: { status: "REVOKED", revokedAt: new Date(), revokedByIdentityId: actor.identityId } });
      await writeAudit(tx, { ...event(actor, "INVITE_REVOKED", old.id), resourceType: "AccessInvite" });
      await markContractualInviteRevoked(tx, actor.tenantId, old.id, actor.identityId);
      return { id: old.id, status: "REVOKED" as const };
    }
    if (!tokenHash || !old.tenant.ativo || !old.profile.ativo) fail("Empresa ou perfil indisponível.");
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`access-invite:${actor.tenantId}:${old.email}`}, 0))`;
    await assertInviteRateLimit(tx, actor.tenantId, old.email);
    const identity = await tx.authIdentity.findUnique({ where: { email: old.email }, select: { id: true, status: true } });
    if (identity?.status === "INACTIVE" || identity && await tx.tenantMembership.findUnique({
      where: { identityId_tenantId: { identityId: identity.id, tenantId: actor.tenantId } }, select: { id: true } }) ||
      await tx.usuario.findFirst({ where: { tenantId: actor.tenantId, email: old.email }, select: { id: true } })) fail("Não foi possível reemitir este convite. Confira os acessos da empresa.");
    if (old.status === "PENDING") {
      const expired = old.expiresAt <= new Date();
      await tx.accessInvite.update({ where: { id: old.id }, data: expired ? { status: "EXPIRED" } :
        { status: "REVOKED", revokedAt: new Date(), revokedByIdentityId: actor.identityId } });
      await writeAudit(tx, { ...event(actor, expired ? "INVITE_EXPIRED" : "INVITE_REVOKED", old.id), resourceType: "AccessInvite", reason: "Reemissão" });
    }
    const next = await tx.accessInvite.create({ data: { tenantId: actor.tenantId, email: old.email, name: old.name,
      role: "OWNER", profileId: old.profileId, tokenHash, expiresAt: inviteExpiresAt(), invitedByIdentityId: actor.identityId } });
    await linkReissuedContractualInvite(tx, actor.tenantId, old.id, next.id, actor.identityId);
    await writeAudit(tx, { ...event(actor, "INVITE_CREATED", next.id), resourceType: "AccessInvite", reason: "Reemissão" });
    return { id: next.id, status: next.status, email: old.email, name: old.name, expiresAt: next.expiresAt,
      profileName: old.profile.nome, tenantName: old.tenant.nome, replacesId: old.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

export async function continueContractualNomination(actor: ContractualActor) {
  return prisma.$transaction(async tx => {
    await lockContractualTenant(tx, actor.tenantId); await assertContractualOwnerActive(tx, actor);
    return { assigned: await finalizeContractualNomination(tx, actor) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

export async function contractualOnboardingState(session: UserSession) {
  if (session.authMode !== "identity" || session.accessSource !== "MEMBERSHIP" || !session.identityId || !session.membershipId) fail("Contexto empresarial necessário.", 403);
  const ready = await contractualReadiness(prisma, session.tenantId);
  const userAccepted = await acceptedUserTerms(prisma, session.identityId);
  const userDocumentsAvailable = (await requiredPublishedTerms(prisma, "USUARIO")).some(v => v.document.code === "TERM_USUARIO");
  const owner = session.membershipRole === "OWNER";
  const row = await prisma.tenantContractualOnboarding.findUnique({ where: { tenantId: session.tenantId },
    include: { invitation: true } });
  const invite = row?.invitation;
  const pending = row?.choice === "OTHER" && row.status === "PENDING" && !!invite;
  const canResolve = owner && userAccepted && !ready.validResponsible && pending && invite?.status === "ACCEPTED" && invite.acceptedByIdentityId === session.identityId;
  const invitationStatus = invite?.status === "PENDING" && invite.expiresAt <= new Date() ? "EXPIRED" : invite?.status;
  const waiting = pending && (invitationStatus === "PENDING" || invitationStatus === "ACCEPTED");
  const status = !userDocumentsAvailable || !ready.documentsAvailable ? "DOCUMENTS_UNAVAILABLE" : !userAccepted ? "USER_TERMS_REQUIRED" :
    ready.active ? "ACTIVE" : ready.validResponsible ? "AWAITING_CONTRACT" : waiting ? "AWAITING_RESPONSIBLE" : "CHOOSE_RESPONSIBLE";
  return { status, tenantName: session.tenantNome, isOwner: owner,
    canChoose: owner && userAccepted && userDocumentsAvailable && ready.documentsAvailable && !ready.validResponsible && !waiting,
    canResolve: !!canResolve, canAcceptContract: userAccepted && ready.responsibleMembershipId === session.membershipId,
    invitation: owner && userAccepted && row?.choice === "OTHER" && invite ? {
      id: invite.id, name: invite.name, email: invite.email, status: invitationStatus, expiresAt: invite.expiresAt.toISOString(),
      canReissue: !ready.validResponsible && row.status === "PENDING" && ["PENDING", "EXPIRED"].includes(invitationStatus!),
      canRevoke: !ready.validResponsible && row.status === "PENDING" && invitationStatus === "PENDING",
    } : null };
}
