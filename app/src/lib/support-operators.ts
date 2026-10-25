import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { writeAudit } from "./audit";
import { supportDenied } from "./support-authorization";

/** Explicit administrative act only. No inference from any existing role or email. */
export async function setSupportOperator(actorId: string, identityId: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`support-operator:${identityId}`},0))`;
    const actor = await tx.authIdentity.findUnique({ where: { id: actorId }, select: { status: true, platformAdmin: true } });
    if (actor?.status !== "ACTIVE" || actor.platformAdmin?.status !== "ACTIVE") supportDenied();
    const identity = await tx.authIdentity.findUnique({ where: { id: identityId }, select: { status: true } });
    if (identity?.status !== "ACTIVE") supportDenied("Identidade ativa necessária.", 409);
    const before = await tx.supportOperator.findUnique({ where: { identityId } });
    if (before?.status === "ACTIVE") return before;
    const operator = await tx.supportOperator.upsert({ where: { identityId },
      create: { identityId }, update: { status: "ACTIVE" } });
    await writeAudit(tx, { actorIdentityId: actorId, accessMode: "PLATFORM_ADMIN",
      action: "SUPPORT_OPERATOR_GRANTED", resourceType: "SupportOperator", resourceId: operator.id,
      changes: { before: { status: before?.status ?? null }, after: { status: "ACTIVE" } } });
    return operator;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** Disabling a technical capability never silently removes a business relationship. */
export async function offboardSupportOperator(actorId: string, operatorId: string, reason: string, devMembershipIds: string[] = []) {
  return prisma.$transaction(async tx => {
    const target = await tx.supportOperator.findUnique({ where: { id: operatorId } });
    if (!target) supportDenied("Operador não encontrado.", 404);
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`support-operator:${target.identityId}`},0))`;
    const actor = await tx.authIdentity.findUnique({ where: { id: actorId }, select: { status: true, platformAdmin: true } });
    if (actor?.status !== "ACTIVE" || actor.platformAdmin?.status !== "ACTIVE") supportDenied();
    const memberships = await tx.tenantMembership.findMany({ where: { id: { in: devMembershipIds }, identityId: target.identityId },
      select: { id: true, role: true, tenantId: true, tenant: { select: { slug: true } } } });
    if (memberships.length !== devMembershipIds.length || memberships.some(m => m.tenant.slug !== "modo-dev" || m.role === "OWNER")) {
      supportDenied("Remoção explícita restrita a vínculos não OWNER do MODO DEV PRINCIPAL.", 409);
    }
    const grants = await tx.supportGrant.findMany({ where: { requesterIdentityId: target.identityId, status: { in: ["ACTIVE", "PENDING"] } },
      select: { id: true, tenantId: true, status: true } });
    await tx.supportOperator.update({ where: { id: target.id }, data: { status: "INACTIVE" } });
    for (const grant of grants) {
      await tx.supportGrant.update({ where: { id: grant.id }, data: { status: "REVOKED", revokedAt: new Date(),
        revokedByIdentityId: actorId, revocationReason: "Operador de suporte desativado." } });
      await tx.supportGrantEvent.create({ data: { grantId: grant.id, tenantId: grant.tenantId, type: "REVOKED",
        actorIdentityId: actorId, detail: "Offboarding do operador de suporte." } });
      await writeAudit(tx, { actorIdentityId: actorId, tenantId: grant.tenantId, accessMode: "PLATFORM_ADMIN",
        action: "SUPPORT_REVOKED_BY_OFFBOARDING", resourceType: "SupportGrant", resourceId: grant.id, supportGrantId: grant.id,
        changes: { before: { status: grant.status }, after: { status: "REVOKED" } } });
    }
    for (const membership of memberships) {
      await tx.tenantMembership.update({ where: { id: membership.id }, data: { status: "INACTIVE" } });
      await writeAudit(tx, { actorIdentityId: actorId, tenantId: membership.tenantId, accessMode: "PLATFORM_ADMIN",
        action: "DEV_MEMBERSHIP_DISABLED_BY_OFFBOARDING", resourceType: "TenantMembership", resourceId: membership.id });
    }
    await writeAudit(tx, { actorIdentityId: actorId, accessMode: "PLATFORM_ADMIN", action: "SUPPORT_OPERATOR_DISABLED",
      resourceType: "SupportOperator", resourceId: target.id, reason,
      changes: { before: { status: target.status }, after: { status: "INACTIVE" } },
      metadata: { revokedGrants: grants.length, explicitDevMemberships: memberships.length } });
    return { status: "INACTIVE", revokedGrants: grants.length, devMembershipsDisabled: memberships.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
