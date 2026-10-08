import { Prisma } from "@prisma/client";
import { prisma, requireDevDatabase } from "../access3b/context.mjs";

const email = process.env.ACCESS3C_ADMIN_EMAIL?.trim().toLowerCase();
const tenantName = "Dez Soluções DEV";
const apply = process.argv.includes("--apply");

async function inspect(db) {
  const identity = await db.authIdentity.findUnique({
    where: { email },
    include: {
      platformAdmin: true,
      memberships: { include: { tenant: true, legacyMaps: { include: { legacyUsuario: true } } } },
    },
  });
  if (!identity || identity.status !== "ACTIVE") throw new Error("Active DEV identity not found");
  const membership = identity.memberships.find(item => item.tenant.nome === tenantName);
  if (!membership || membership.status !== "ACTIVE" || !membership.tenant.ativo ||
      !["ADMIN", "OWNER"].includes(membership.role)) {
    throw new Error("Active DEV admin membership not found");
  }
  if (membership.legacyMaps.length !== 1) throw new Error("Expected one legacy mapping for DEV membership");
  const map = membership.legacyMaps[0];
  if (map.identityId !== identity.id || map.tenantId !== membership.tenantId ||
      map.legacyUsuario.tenantId !== membership.tenantId || !map.legacyUsuario.ativo ||
      map.legacyUsuario.email.trim().toLowerCase() !== identity.email ||
      map.legacyUsuario.senhaHash !== identity.senhaHash ||
      map.legacyUsuario.papel !== "admin") {
    throw new Error("DEV legacy mapping does not match the identity and membership");
  }
  if (identity.platformAdmin?.status === "INACTIVE") {
    throw new Error("Existing inactive PlatformAdmin requires manual review");
  }
  return { identity, membership };
}

try {
  if (!email || !email.includes("@")) throw new Error("Set ACCESS3C_ADMIN_EMAIL to the existing DEV identity");
  await requireDevDatabase();
  if (!apply) {
    const { identity } = await inspect(prisma);
    console.log(JSON.stringify({ database: "gestar_vf_dev", candidateReady: true,
      platformAdminActive: identity.platformAdmin?.status === "ACTIVE", wouldCreate: !identity.platformAdmin }));
  } else {
    const result = await prisma.$transaction(async tx => {
      await requireDevDatabase(tx);
      const { identity } = await inspect(tx);
      const membershipCount = await tx.tenantMembership.count();
      const created = !identity.platformAdmin;
      if (created) await tx.platformAdmin.create({ data: { identityId: identity.id } });
      if (await tx.tenantMembership.count() !== membershipCount) {
        throw new Error("Business memberships changed; transaction rolled back");
      }
      return { platformAdminActive: true, created, membershipsUnchanged: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    console.log(JSON.stringify(result));
  }
} finally {
  await prisma.$disconnect();
}
