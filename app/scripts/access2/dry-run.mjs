import { prisma, requireDevDatabase, loadAccess2Plan } from "./context.mjs";

try {
  const database = await requireDevDatabase();
  const plan = await loadAccess2Plan();
  const [identities, memberships, mappings, platformAdmins] = await Promise.all([
    prisma.authIdentity.count(), prisma.tenantMembership.count(), prisma.legacyUserAccessMap.count(),
    prisma.platformAdmin.count(),
  ]);
  console.log(JSON.stringify({ database, ...plan.report, identities, memberships, mappings, platformAdmins }, null, 2));
} finally {
  await prisma.$disconnect();
}
