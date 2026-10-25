import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireSupportOperator } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { pendingOperatorTerms } from "@/lib/support-terms";
import { writeAudit } from "@/lib/audit";
import { lockSupportOperator } from "@/lib/support-authorization";
export async function GET() {
  try { const identity = await requireSupportOperator();
    return NextResponse.json({ pending: await pendingOperatorTerms(identity.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) { return NextResponse.json({ error: e.status ? e.message : "Falha ao consultar termos pessoais." }, { status: e.status ?? 500 }); }
}
export async function POST(request: Request) {
  try {
    const identity = await requireSupportOperator(), body = await request.json();
    if (body?.agreed !== true || typeof body.versionId !== "string") return NextResponse.json({ error: "Leia e confirme o documento pessoal." }, { status: 400 });
    const accepted = await prisma.$transaction(async tx => {
      await lockSupportOperator(tx, identity.id);
      const v = await tx.termVersion.findUnique({ where: { id: body.versionId }, include: { document: true } });
      if (!v || v.document.audience !== "USUARIO") throw Object.assign(new Error("Aceite contratual indisponível ao suporte."), { status: 403 });
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`term:${v.documentId}`},0))`;
      const current = await tx.termVersion.findUnique({ where: { id: v.id } });
      if (current?.status !== "PUBLISHED") throw Object.assign(new Error("Documento fora de vigência."), { status: 409 });
      const existing = await tx.termAcceptance.findFirst({ where: { identityId: identity.id, tenantId: null, membershipId: null,
        ...(current.requiresReaccept ? { termVersionId: current.id } : { version: { documentId: current.documentId } }) } });
      if (existing) return true;
      const row = await tx.termAcceptance.create({ data: { identityId: identity.id, termVersionId: current.id,
        tenantId: null, membershipId: null, scopeKey: "GLOBAL", documentHash: current.sha256 } });
      await writeAudit(tx, { actorIdentityId: identity.id, accessMode: "SYSTEM", action: "SUPPORT_PERSONAL_TERM_ACCEPTED",
        resourceType: "TermVersion", resourceId: current.id, metadata: { audience: "USUARIO", acceptanceId: row.id } });
      return false;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ alreadyAccepted: accepted });
  } catch (e: any) { return NextResponse.json({ error: e.status ? e.message : "Aceite pessoal não confirmado." }, { status: e.status ?? (e.code === "P2034" ? 409 : 500) }); }
}
