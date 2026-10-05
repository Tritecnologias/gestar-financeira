import { Prisma } from "@prisma/client";
import { prisma, requireDevDatabase, loadAccess2Plan } from "./context.mjs";

try {
  const database = await requireDevDatabase();
  const beforeLegacy = await prisma.usuario.findMany({
    select: { id: true, tenantId: true, email: true, nome: true, senhaHash: true, papel: true, ativo: true },
    orderBy: { id: "asc" },
  });
  const plan = await loadAccess2Plan();
  // The full aggregate classification is emitted before the first write.
  console.log(JSON.stringify({ database, dryRun: plan.report }, null, 2));

  const created = await prisma.$transaction(async tx => {
    let count = 0;
    for (const { user, email, role, status } of plan.safe) {
      const current = await tx.usuario.findUnique({
        where: { id: user.id },
        select: { id: true, tenantId: true, email: true, nome: true, senhaHash: true, papel: true, ativo: true },
      });
      if (!current || current.tenantId !== user.tenantId || current.email !== user.email ||
          current.nome !== user.nome || current.senhaHash !== user.senhaHash ||
          current.papel !== user.papel || current.ativo !== user.ativo) {
        throw new Error("Legacy account changed after dry-run; backfill rolled back");
      }
      if (await tx.legacyUserAccessMap.findUnique({ where: { legacyUsuarioId: user.id } }) ||
          await tx.authIdentity.findUnique({ where: { email } })) {
        throw new Error("Identity or mapping collision after dry-run; backfill rolled back");
      }

      const identity = await tx.authIdentity.create({
        data: { email, nome: user.nome.trim(), senhaHash: user.senhaHash, status },
      });
      const membership = await tx.tenantMembership.create({
        data: { identityId: identity.id, tenantId: user.tenantId, role, status },
      });
      await tx.legacyUserAccessMap.create({
        data: { legacyUsuarioId: user.id, identityId: identity.id,
          tenantId: user.tenantId, membershipId: membership.id },
      });
      count++;
    }
    return count;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });

  const afterLegacy = await prisma.usuario.findMany({
    select: { id: true, tenantId: true, email: true, nome: true, senhaHash: true, papel: true, ativo: true },
    orderBy: { id: "asc" },
  });
  if (JSON.stringify(afterLegacy) !== JSON.stringify(beforeLegacy)) {
    throw new Error("Legacy Usuario records changed unexpectedly");
  }
  const after = await loadAccess2Plan();
  const [identities, memberships, mappings] = await Promise.all([
    prisma.authIdentity.count(), prisma.tenantMembership.count(), prisma.legacyUserAccessMap.count(),
  ]);
  console.log(JSON.stringify({ created, identities, memberships, mappings,
    alreadyMapped: after.report.alreadyMapped, remainingSafe: after.report.safe,
    legacyIntact: true }, null, 2));
} finally {
  await prisma.$disconnect();
}
