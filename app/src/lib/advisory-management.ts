import type { Prisma } from "@prisma/client";
import type { UserSession } from "@/types";
import { advisoryPermissions } from "./advisory-policy";

export function advisoryError(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
export function sameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(process.env.APP_PUBLIC_URL ?? request.url).origin) advisoryError("Origem inválida.", 403);
}
/** Fresh transactional authority; a global capability never substitutes a membership. */
export async function advisoryManager(tx: Prisma.TransactionClient, session: UserSession, permissions?: unknown) {
  if (session.accessSource !== "MEMBERSHIP" || !session.membershipId || !session.identityId) advisoryError("Vínculo empresarial necessário.", 403);
  await tx.$queryRaw`SELECT id FROM tenant_memberships WHERE id=${session.membershipId} AND tenant_id=${session.tenantId} FOR SHARE`;
  const member = await tx.tenantMembership.findFirst({ where: { id: session.membershipId, tenantId: session.tenantId,
    identityId: session.identityId, status: "ACTIVE", identity: { status: "ACTIVE" }, tenant: { ativo: true } },
    include: { profile: true } });
  const keys = member?.profile?.ativo && member.profile.tenantId === session.tenantId ? member.profile.permissoes : [];
  if (!member || member.role !== "OWNER" && !keys.includes("acessos.assessoria.manage")) advisoryError("Permissão para gerenciar assessoria necessária.", 403);
  const requested = permissions === undefined ? [] : advisoryPermissions(permissions);
  if (member.role !== "OWNER" && requested.some(p => !keys.includes(p))) advisoryError("Você só pode conceder permissões que possui.", 403);
  return { member, permissions: requested };
}
