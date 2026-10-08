import { prisma } from "@/lib/db";
import type { UserSession } from "@/types";

export type PendingTerm = {
  versionId: string;
  documentId: string;
  audience: "CONTRATANTE" | "USUARIO";
  title: string;
  version: string;
  publishedAt: Date | null;
  actionable: boolean;
  reason?: string;
};

/** Only identity sessions can produce verifiable individual acceptance evidence. */
export async function pendingTerms(session: UserSession): Promise<PendingTerm[]> {
  if (session.authMode !== "identity" || !session.identityId) return [];
  const versions = await prisma.termVersion.findMany({
    where: { status: "PUBLISHED", document: { required: true } },
    include: { document: true },
    orderBy: { createdAt: "asc" },
  });
  if (!versions.length) return [];
  const responsible = await prisma.tenantContractualResponsible.findUnique({
    where: { tenantId: session.tenantId },
    include: { membership: { include: { identity: { select: { status: true } } } } },
  });
  const currentResponsible = responsible?.membership.status === "ACTIVE" &&
    responsible.membership.role === "OWNER" && responsible.membership.identity.status === "ACTIVE"
    ? responsible.membership : null;
  const pending: PendingTerm[] = [];
  for (const term of versions) {
    const contract = term.document.audience === "CONTRATANTE";
    const identityId = contract ? currentResponsible?.identityId : session.identityId;
    const scope = contract ? session.tenantId : null;
    const membershipId = contract ? currentResponsible?.id : null;
    const accepted = identityId && await prisma.termAcceptance.findFirst({
      where: {
        identityId,
        tenantId: scope,
        ...(contract ? { membershipId } : {}),
        ...(term.requiresReaccept ? { termVersionId: term.id, documentHash: term.sha256 } : { version: { documentId: term.documentId } }),
      },
      select: { id: true },
    });
    if (accepted) continue;
    pending.push({
      versionId: term.id, documentId: term.documentId, audience: term.document.audience,
      title: term.title, version: term.version, publishedAt: term.publishedAt,
      actionable: !contract || currentResponsible?.id === session.membershipId,
      reason: contract && !currentResponsible ? "Responsável contratual ainda não designado ou inativo." :
        contract && currentResponsible?.id !== session.membershipId ? "Aguardando aceite do responsável contratual." : undefined,
    });
  }
  return pending;
}

export async function requireAcceptedTerms(session: UserSession) {
  if ((await pendingTerms(session)).length) {
    throw Object.assign(new Error("Aceite de termos obrigatório pendente."), { status: 428 });
  }
}
