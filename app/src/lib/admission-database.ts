import type { Prisma } from "@prisma/client";
import { admissionDatabaseGuardSql } from "./admission-database-contract.mjs";
import { admissionFailure } from "./admission-policy";

export async function requireAdmissionDatabase(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRawUnsafe<{ allowed: boolean }[]>(admissionDatabaseGuardSql(process.env.DEPLOYMENT_PROFILE));
  if (rows.length !== 1 || rows[0].allowed !== true) throw admissionFailure("Não encontrado.", 404);
}
