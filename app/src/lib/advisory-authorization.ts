import type { Prisma, PrismaClient } from "@prisma/client";
import { advisoryActive, advisoryPermissions } from "./advisory-policy";

export async function authorizedAdvisoryGrant(db: Pick<PrismaClient | Prisma.TransactionClient, "advisoryAccessGrant">, identityId: string, id: string, tenantId?: string) {
  const grant = await db.advisoryAccessGrant.findUnique({ where: { id }, include: {
    identity: { select: { status: true } }, tenant: { select: { ativo: true, nome: true } },
  } });
  if (!grant || grant.identityId !== identityId || tenantId && grant.tenantId !== tenantId ||
      grant.identity.status !== "ACTIVE" || !grant.tenant.ativo || !advisoryActive(grant)) {
    throw Object.assign(new Error("Acesso de Assessoria indisponível ou revogado. Selecione outro contexto."), { status: 403 });
  }
  advisoryPermissions(grant.permissions);
  return grant;
}
