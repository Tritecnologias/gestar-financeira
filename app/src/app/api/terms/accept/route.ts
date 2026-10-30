import { withAdvisoryAudit } from "@/lib/advisory-request";
import { withAccessRequest } from "@/lib/access-request-context";
import { trustedClientIp } from "@/lib/trusted-proxy";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/tenant";
import { auditContext, writeAudit } from "@/lib/audit";
import { acceptedUserTerms, contractualReadiness } from "@/lib/contractual-state";
import { lockContractualTenant, finalizeContractualNomination, assertContractualOwnerActive } from "@/lib/contractual-onboarding";
import { sameOrigin } from "@/lib/advisory-management";
import { requireTenantModalityReady } from "@/lib/tenant-modality-state";

async function handlePOST(req: NextRequest) {
  try {
    sameOrigin(req);
    const { session } = await requireSession({ allowPendingTerms: true });
    if (session.authMode !== "identity" || !session.identityId ||
        (!session.membershipId && session.accessSource !== "SUPPORT_GRANT" && session.accessSource !== "ADVISORY")) {
      return NextResponse.json({ error: "Identidade válida necessária." }, { status: 403 });
    }
    const identityId = session.identityId;
    const membershipId = session.membershipId ?? null;
    const body = await req.json();
    if (body.agreed !== true || typeof body.versionId !== "string") {
      return NextResponse.json({ error: "Leia o documento e marque o aceite ativo." }, { status: 400 });
    }
    const version = await prisma.termVersion.findUnique({ where: { id: body.versionId }, include: { document: true } });
    if (!version || version.status !== "PUBLISHED") return NextResponse.json({ error: "Versão fora de vigência." }, { status: 409 });
    const ip = await trustedClientIp(req.headers);
    const userAgent = req.headers.get("user-agent")?.slice(0, 512) || null;
    const contract = version.document.audience === "CONTRATANTE";
    const result = await prisma.$transaction(async tx => {
      await lockContractualTenant(tx, session.tenantId);
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`term:${version.documentId}`}, 0))`;
      const current = await tx.termVersion.findUnique({ where: { id: version.id } });
      if (current?.status !== "PUBLISHED") throw Object.assign(new Error("Versão fora de vigência."), { status: 409 });
      const wasContractActive = contract && (await contractualReadiness(tx, session.tenantId)).active;
      if (contract) {
        await requireTenantModalityReady(tx, session.tenantId);
        if (!await acceptedUserTerms(tx, identityId)) throw Object.assign(new Error("Aceite primeiro os Termos de Uso do Usuário."), { status: 403 });
        if (!membershipId) throw Object.assign(new Error("Somente o responsável contratual pode aceitar este documento."), { status: 403 });
        await assertContractualOwnerActive(tx, { tenantId: session.tenantId, identityId, membershipId });
        const responsible = await tx.tenantContractualResponsible.findUnique({ where: { tenantId: session.tenantId }, include: { membership: { include: { identity: true } } } });
        if (!responsible || responsible.membershipId !== membershipId ||
          responsible.membership.identityId !== identityId || responsible.membership.role !== "OWNER" ||
          responsible.membership.status !== "ACTIVE" || responsible.membership.identity.status !== "ACTIVE") {
          throw Object.assign(new Error("Somente o responsável contratual OWNER ativo pode aceitar este documento."), { status: 403 });
        }
      }
      const existing = await tx.termAcceptance.findFirst({ where: {
        identityId, tenantId: contract ? session.tenantId : null,
        ...(contract ? { membershipId } : {}),
        ...(current.requiresReaccept ? { termVersionId: current.id } : { version: { documentId: current.documentId } }),
      }, select: { id: true } });
      if (existing) {
        if (!contract && session.accessSource === "MEMBERSHIP" && session.membershipRole === "OWNER" && membershipId) {
          await finalizeContractualNomination(tx, { tenantId: session.tenantId, identityId, membershipId });
        }
        return { alreadyAccepted: true };
      }
      const acceptance = await tx.termAcceptance.create({ data: {
        identityId, termVersionId: current.id,
        tenantId: contract ? session.tenantId : null,
        membershipId: contract ? membershipId : null,
        scopeKey: contract ? session.tenantId : "GLOBAL", roleAtAcceptance: contract ? "OWNER" : null,
        ipAddress: ip, userAgent, documentHash: current.sha256,
      } });
      await writeAudit(tx, { ...auditContext(session), tenantId: session.tenantId,
        actorMembershipId: contract ? membershipId : null, action: "TERM_ACCEPTED",
        resourceType: "TermVersion", resourceId: current.id,
        metadata: { acceptanceId: acceptance.id, audience: version.document.audience,
          documentCode: version.document.code, version: current.version } });
      if (!contract && session.accessSource === "MEMBERSHIP" && session.membershipRole === "OWNER" && membershipId) {
        await finalizeContractualNomination(tx, { tenantId: session.tenantId, identityId, membershipId });
      }
      if (contract && !wasContractActive && (await contractualReadiness(tx, session.tenantId)).active) {
        await writeAudit(tx, { ...auditContext(session), action: "CONTRACTUAL_TENANT_RELEASED",
          resourceType: "TenantContractualResponsible", resourceId: session.tenantId,
          metadata: { acceptanceId: acceptance.id, versionId: current.id } });
      }
      return { alreadyAccepted: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = (error as {code?: string}).code;
    const status = (error as {status?: number}).status ?? (["P2002", "P2034"].includes(code || "") ? 409 : 500);
    return NextResponse.json({ error: status === 500 ? "Falha ao registrar aceite." : (error as Error).message }, { status });
  }
}

const advisoryPOST = withAccessRequest("TERM_ACCEPT", handlePOST);

export const POST = withAdvisoryAudit("/api/terms/accept", "POST", advisoryPOST);
