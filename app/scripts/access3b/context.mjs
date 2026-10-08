import { prisma } from "../../src/lib/db.ts";
import { buildPlatformAdminPlan } from "./analysis.mjs";

export async function requireDevDatabase(db = prisma) {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (url.protocol !== "postgresql:" || url.pathname !== "/gestar_vf_dev" ||
      url.port !== "55432" || !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("ACCESS-3B runs only against the local DEV database on port 55432");
  }
  const [{ database }] = await db.$queryRaw`SELECT current_database() AS database`;
  if (database !== "gestar_vf_dev") throw new Error("ACCESS-3B database mismatch");
  return database;
}

export async function loadPlatformAdminPlan(db = prisma) {
  const [users, identities, maps] = await Promise.all([
    db.usuario.findMany({ select: {
      id: true, tenantId: true, nome: true, email: true, senhaHash: true,
      papel: true, ativo: true, tenant: { select: { ativo: true } },
    } }),
    db.authIdentity.findMany({ select: {
      id: true, email: true, nome: true, senhaHash: true, status: true,
      platformAdmin: { select: { id: true, identityId: true, status: true } },
    } }),
    db.legacyUserAccessMap.findMany({ select: {
      legacyUsuarioId: true, identityId: true, tenantId: true,
      membershipId: true, platformAdminId: true,
      identity: { select: {
        id: true, email: true, nome: true, senhaHash: true, status: true,
        platformAdmin: { select: { id: true, identityId: true, status: true } },
        memberships: { select: { id: true } },
      } },
    } }),
  ]);
  return buildPlatformAdminPlan(users, identities, maps);
}

export { prisma };
