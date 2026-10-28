import type { Prisma } from "@prisma/client";

export type ContractualReader = Pick<Prisma.TransactionClient, "termVersion" | "termAcceptance" | "tenantContractualResponsible">;

export async function requiredPublishedTerms(db: ContractualReader, audience: "USUARIO" | "CONTRATANTE") {
  return db.termVersion.findMany({ where: { status: "PUBLISHED", document: { required: true, audience } },
    include: { document: true }, orderBy: { createdAt: "asc" } });
}

export async function acceptedUserTerms(db: ContractualReader, identityId: string) {
  const versions = await requiredPublishedTerms(db, "USUARIO");
  if (!versions.some(v => v.document.code === "TERM_USUARIO")) return false;
  for (const v of versions) {
    if (!await db.termAcceptance.findFirst({ where: { identityId, tenantId: null,
      ...(v.requiresReaccept ? { termVersionId: v.id, documentHash: v.sha256 } : { version: { documentId: v.documentId } }) }, select: { id: true } })) return false;
  }
  return true;
}

/** Current authorization, never a cached onboarding flag or an email match. */
export async function contractualReadiness(db: ContractualReader, tenantId: string) {
  const responsible = await db.tenantContractualResponsible.findUnique({ where: { tenantId },
    include: { membership: { include: { identity: { select: { status: true } }, tenant: { select: { ativo: true } } } } } });
  const validResponsible = !!responsible && responsible.membership.tenantId === tenantId &&
    responsible.membership.role === "OWNER" && responsible.membership.status === "ACTIVE" &&
    responsible.membership.identity.status === "ACTIVE" && responsible.membership.tenant.ativo;
  const versions = await requiredPublishedTerms(db, "CONTRATANTE");
  const documentsAvailable = versions.some(v => v.document.code === "TERM_CONTRATANTE");
  let accepted = validResponsible && documentsAvailable;
  if (accepted && responsible) for (const v of versions) {
    if (!await db.termAcceptance.findFirst({ where: { identityId: responsible.membership.identityId,
      membershipId: responsible.membershipId, tenantId,
      ...(v.requiresReaccept ? { termVersionId: v.id, documentHash: v.sha256 } : { version: { documentId: v.documentId } }) }, select: { id: true } })) accepted = false;
  }
  return { active: accepted, validResponsible, documentsAvailable,
    responsibleMembershipId: validResponsible ? responsible!.membershipId : null,
    responsibleIdentityId: validResponsible ? responsible!.membership.identityId : null };
}
