import { prisma } from "@/lib/db";
import { requireTenantMembership } from "@/lib/tenant";

/** ACCESS-5B uses only the designated contractual responsible, never any ADMIN. */
export async function requireSupportApprover() {
  const context = await requireTenantMembership();
  const session = context.session;
  if (session.membershipRole !== "OWNER" || !session.membershipId || !session.identityId) {
    throw Object.assign(new Error("Somente o responsável contratual OWNER pode decidir suporte."), { status: 403 });
  }
  const responsible = await prisma.tenantContractualResponsible.findUnique({
    where: { tenantId: session.tenantId }, select: { membershipId: true },
  });
  if (responsible?.membershipId !== session.membershipId) {
    throw Object.assign(new Error("Este OWNER não é o responsável contratual designado."), { status: 403 });
  }
  return context;
}
