import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { acceptedUserTerms } from "@/lib/contractual-state";
import { assertContractualOwnerActive, lockContractualTenant } from "@/lib/contractual-onboarding";
import { tenantModalityState, validTenantModality } from "@/lib/tenant-modality-state";
import { writeAudit } from "@/lib/audit";
import type { UserSession } from "@/types";

export async function selectTenantModality(session: UserSession, input: unknown) {
  if (session.authMode !== "identity" || session.accessSource !== "MEMBERSHIP" || session.membershipRole !== "OWNER" || !session.identityId || !session.membershipId) {
    throw Object.assign(new Error("Somente o Proprietário ativo deste espaço pode definir a modalidade."), { status: 403 });
  }
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length !== 1 || !Object.hasOwn(input, "modalidade") || !validTenantModality((input as { modalidade?: unknown }).modalidade)) {
    throw Object.assign(new Error("Escolha Gestão Pessoal — PF ou Gestão Empresarial — PJ."), { status: 400 });
  }
  const modalidade = (input as { modalidade: "PF" | "PJ" }).modalidade;
  const actor = { tenantId: session.tenantId, identityId: session.identityId, membershipId: session.membershipId };
  return prisma.$transaction(async tx => {
    await lockContractualTenant(tx, actor.tenantId);
    await assertContractualOwnerActive(tx, actor);
    if (!await acceptedUserTerms(tx, actor.identityId)) throw Object.assign(new Error("Aceite primeiro os Termos de Uso do Usuário."), { status: 428 });
    const state = await tenantModalityState(tx, actor.tenantId);
    if (!state.pending) {
      if (state.modalidade === modalidade) return { modalidade, unchanged: true };
      throw Object.assign(new Error("Este espaço não possui escolha de modalidade pendente. A modalidade não foi alterada."), { status: 409 });
    }
    await tx.tenant.update({ where: { id: actor.tenantId }, data: { modalidade, escolhaModalidadePendente: false } });
    await writeAudit(tx, { tenantId: actor.tenantId, actorIdentityId: actor.identityId, actorMembershipId: actor.membershipId,
      accessMode: "MEMBERSHIP", action: "TENANT_MODALITY_SELECTED", resourceType: "Tenant", resourceId: actor.tenantId,
      changes: { before: { modalidade: null, escolhaModalidadePendente: true }, after: { modalidade, escolhaModalidadePendente: false } } });
    return { modalidade, unchanged: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
