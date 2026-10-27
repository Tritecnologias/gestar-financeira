import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { databaseConfig } from "./database-config.mjs";

// Credential writes must never enter Prisma's error/query logger, including a
// failed update whose rendered arguments could contain the password verifier.
const scope = globalThis as unknown as { accountPrisma?: PrismaClient };
export function accountDatabase() {
  if (!scope.accountPrisma) {
    const { connectionString, schema } = databaseConfig();
    scope.accountPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 2 }, schema ? { schema } : undefined), log: [] });
  }
  return scope.accountPrisma;
}
