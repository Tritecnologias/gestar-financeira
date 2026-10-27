import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission, permissionError } from "@/lib/permissions";
import { advisoryManager, advisoryError, sameOrigin } from "@/lib/advisory-management";
import { auditContext, writeAudit } from "@/lib/audit";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request);
    const { session } = await requirePermission("acessos.assessoria.manage");
    const { id } = await params;
    const body = await request.json();
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (body.action !== "revoke" || body.confirm !== true || reason.length < 3 || reason.length > 500 ||
      Object.keys(body).some(k => !["action", "confirm", "reason"].includes(k))) advisoryError("Confirme a revogação e informe o motivo.");
    const result = await prisma.$transaction(async tx => {
      await advisoryManager(tx, session);
      const grant = await tx.advisoryAccessGrant.findFirst({ where: { id, tenantId: session.tenantId } });
      if (!grant) advisoryError("Autorização não encontrada nesta empresa.", 404);
      if (grant.status === "INACTIVE") return { revoked: true, unchanged: true };
      await tx.advisoryAccessGrant.update({ where: { id, tenantId: session.tenantId }, data: {
        status: "INACTIVE", revokedAt: new Date(), revokedByIdentityId: session.identityId!, revocationReason: reason } });
      await writeAudit(tx, { ...auditContext(session), advisoryGrantId: id, action: "ADVISORY_REVOKED",
        resourceType: "AdvisoryAccessGrant", resourceId: id, changes: { before: { status: "ACTIVE" }, after: { status: "INACTIVE" } } });
      return { revoked: true, unchanged: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(result);
  } catch (error) {
    if ((error as { code?: string }).code === "P2034") return NextResponse.json({ error: "Operação concorrente. Recarregue a lista." }, { status: 409 });
    const e = permissionError(error); return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
