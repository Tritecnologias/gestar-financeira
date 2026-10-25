import type { PrismaClient, Prisma } from "@prisma/client";
import { validSupportModules } from "./support-policy";

type Reader = Pick<PrismaClient | Prisma.TransactionClient, "authIdentity" | "supportGrant">;
export function supportDenied(message = "Acesso temporário de suporte indisponível.", status = 403): never {
  throw Object.assign(new Error(message), { status });
}

export async function activeSupportOperator(db: Pick<Reader, "authIdentity">, identityId: string) {
  const identity = await db.authIdentity.findUnique({ where: { id: identityId },
    select: { id: true, status: true, supportOperator: { select: { id: true, status: true } } } });
  if (identity?.status !== "ACTIVE" || identity.supportOperator?.status !== "ACTIVE") supportDenied();
  return identity;
}

/** No cookie, membership, PlatformAdmin flag or historical author is authorization. */
export async function authorizedSupportGrant(db: Reader, identityId: string, grantId: string, tenantId?: string) {
  await activeSupportOperator(db, identityId);
  const grant = await db.supportGrant.findUnique({ where: { id: grantId }, include: {
    tenant: { select: { id: true, nome: true, ativo: true,
      contractualResponsible: { select: { membershipId: true } } } },
    approver: { select: { id: true, tenantId: true, identityId: true, status: true, role: true,
      identity: { select: { status: true } } } },
  } });
  const now = new Date();
  if (!grant || grant.requesterIdentityId !== identityId || tenantId && grant.tenantId !== tenantId ||
      grant.status !== "ACTIVE" || !grant.tenant.ativo || !grant.approvedAt ||
      !grant.startsAt || grant.startsAt > now || !grant.expiresAt || grant.expiresAt <= now ||
      !validSupportModules(grant.modules) || !["READ_ONLY", "OPERATIONAL"].includes(grant.accessLevel) ||
      grant.approver?.tenantId !== grant.tenantId || grant.approver?.status !== "ACTIVE" ||
      grant.approver?.role !== "OWNER" || grant.approver?.identity.status !== "ACTIVE" ||
      grant.approver?.identityId === identityId ||
      grant.tenant.contractualResponsible?.membershipId !== grant.approvedByMembershipId) supportDenied();
  return { ...grant, startsAt: grant.startsAt, expiresAt: grant.expiresAt };
}

/** Shared by request/approval/offboarding to serialize operator lifecycle changes. */
export async function lockSupportOperator(tx: Prisma.TransactionClient, identityId: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`support-operator:${identityId}`},0))`;
  return activeSupportOperator(tx, identityId);
}
