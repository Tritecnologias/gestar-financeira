import { Prisma } from "@prisma/client";
import { prisma, requireDevDatabase, loadPlatformAdminPlan } from "./context.mjs";

/** Additive and idempotent: neither Usuario nor business memberships are written. */
export async function runPlatformAdminBackfill(db = prisma) {
  await requireDevDatabase(db);
  return db.$transaction(async tx => {
    await requireDevDatabase(tx);
    const plan = await loadPlatformAdminPlan(tx);
    const membershipCount = await tx.tenantMembership.count();
    const counts = { createdIdentities: 0, createdPlatformAdmins: 0, linkedMappings: 0 };

    for (const { user, email, status } of plan.safeCreate) {
      const identity = await tx.authIdentity.create({
        data: { email, nome: user.nome.trim(), senhaHash: user.senhaHash, status },
      });
      const platform = await tx.platformAdmin.create({
        data: { identityId: identity.id, status },
      });
      await tx.legacyUserAccessMap.create({
        data: { legacyUsuarioId: user.id, tenantId: user.tenantId,
          identityId: identity.id, platformAdminId: platform.id },
      });
      counts.createdIdentities++;
      counts.createdPlatformAdmins++;
      counts.linkedMappings++;
    }

    if (await tx.tenantMembership.count() !== membershipCount) {
      throw new Error("Business membership count changed; transaction rolled back");
    }
    const after = await loadPlatformAdminPlan(tx);
    if (after.report.safeCreate ||
        after.report.alreadyMapped !== plan.report.alreadyMapped + counts.linkedMappings) {
      throw new Error("ACCESS-3B verification failed; transaction rolled back");
    }
    return { before: plan.report, changes: counts, after: after.report, membershipsUnchanged: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
