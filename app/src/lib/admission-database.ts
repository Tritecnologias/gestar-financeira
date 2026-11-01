import type { Prisma } from "@prisma/client";
import { HOMOLOG_DATABASE_GUARD_SQL } from "./admission-database-contract.mjs";
import { admissionFailure } from "./admission-policy";

export async function requireAdmissionDatabase(tx: Prisma.TransactionClient) {
  if (process.env.DEPLOYMENT_PROFILE !== "homolog") return;
  const rows = await tx.$queryRawUnsafe<{ allowed: boolean }[]>(HOMOLOG_DATABASE_GUARD_SQL);
  if (rows.length !== 1 || rows[0].allowed !== true) throw admissionFailure("Não encontrado.", 404);
}
