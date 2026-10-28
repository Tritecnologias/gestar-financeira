import { prisma } from "./db";
import type { PendingTerm } from "./terms";

/** Personal consent outside any tenant context; never customer/contract acceptance. */
export async function pendingOperatorTerms(identityId: string): Promise<PendingTerm[]> {
  const versions = await prisma.termVersion.findMany({ where: { status: "PUBLISHED", document: { audience: "USUARIO", required: true } },
    orderBy: { createdAt: "asc" } });
  const result: PendingTerm[] = [];
  for (const v of versions) {
    const accepted = await prisma.termAcceptance.findFirst({ where: { identityId, tenantId: null, membershipId: null,
      ...(v.requiresReaccept ? { termVersionId: v.id, documentHash: v.sha256 } : { version: { documentId: v.documentId } }) }, select: { id: true } });
    if (!accepted) result.push({ versionId: v.id, documentId: v.documentId, title: v.title, version: v.version,
      audience: "USUARIO", sha256: v.sha256, publishedAt: v.publishedAt, actionable: true });
  }
  return result;
}
