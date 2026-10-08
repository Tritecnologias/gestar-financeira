import { prisma } from "../../src/lib/db.ts";
import { buildAccess2Plan } from "./analysis.mjs";

export async function requireDevDatabase() {
  const [{ database }] = await prisma.$queryRaw`SELECT current_database() AS database`;
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (database !== "gestar_vf_dev" || url.pathname !== "/gestar_vf_dev" ||
      !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("ACCESS-2 scripts are restricted to the local DEV database");
  }
  return database;
}

export async function loadAccess2Plan() {
  const [users, identities, maps] = await Promise.all([
    prisma.usuario.findMany({
      select: {
        id: true, tenantId: true, nome: true, email: true, senhaHash: true,
        papel: true, ativo: true, tenant: { select: { id: true, ativo: true } },
      },
    }),
    prisma.authIdentity.findMany({
      select: { id: true, email: true },
    }),
    prisma.legacyUserAccessMap.findMany({
      include: {
        identity: { select: { id: true, email: true, nome: true, senhaHash: true, status: true } },
        membership: { select: { id: true, identityId: true, tenantId: true, role: true, status: true } },
      },
    }),
  ]);
  return buildAccess2Plan(users, identities, maps);
}

export { prisma };
