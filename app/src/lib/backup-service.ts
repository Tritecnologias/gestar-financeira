import { Pool } from "pg";
import { requirePermission } from "@/lib/permissions";
import { databaseConfig } from "@/lib/database-config.mjs";
import { isAbsolute, resolve, relative } from "node:path";

const globalPool = globalThis as unknown as { backupPool?: Pool };
export function backupPool() {
  const { connectionString, schema } = databaseConfig();
  if (schema && schema !== "public") throw Object.assign(new Error("Backup exige schema public."), { status: 409 });
  return globalPool.backupPool ??= new Pool({ connectionString, max: 3, connectionTimeoutMillis: 5000 });
}
export async function backupContext(action: "view" | "create" | "restore") {
  const { session } = await requirePermission(`sistema.backup.${action}`);
  if (session.authMode !== "identity" || session.accessSource !== "MEMBERSHIP" || !session.identityId || !session.membershipId ||
    (action === "restore" && session.membershipRole !== "OWNER")) {
    throw Object.assign(new Error("Backup requer vínculo empresarial ativo; restauração requer OWNER."), { status: 403 });
  }
  return { tenantId: session.tenantId, identityId: session.identityId, membershipId: session.membershipId };
}
export function backupConfig() {
  const directory = process.env.TENANT_BACKUP_DIR;
  if (directory) {
    for (const forbidden of [resolve(process.cwd(), "public"), resolve(process.cwd(), ".next")]) {
      const child = relative(forbidden, directory);
      if (!isAbsolute(directory) || (!child.startsWith("..") && !isAbsolute(child))) throw Object.assign(new Error("Volume privado de backup inválido."), { status: 409 });
    }
  }
  return { sourceCommit: process.env.SOURCE_COMMIT ?? "local", termDir: process.env.TERM_STORAGE_DIR, backupDir: process.env.TENANT_BACKUP_DIR };
}
