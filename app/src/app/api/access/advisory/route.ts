import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission, permissionError, permissionsFor } from "@/lib/permissions";
import { advisoryManager, advisoryError, sameOrigin } from "@/lib/advisory-management";
import { ADVISORY_PERMISSIONS } from "@/lib/advisory-policy";
import { auditContext, writeAudit } from "@/lib/audit";
import { normalizeEmail } from "@/lib/email";

export async function GET() {
  try {
    const ctx = await requirePermission("acessos.assessoria.view");
    if (ctx.session.accessSource !== "MEMBERSHIP") advisoryError("Vínculo empresarial necessário.", 403);
    const own = await permissionsFor(ctx);
    const rows = await prisma.advisoryAccessGrant.findMany({ where: { tenantId: ctx.session.tenantId },
      orderBy: { grantedAt: "desc" }, take: 200,
      include: { identity: { select: { nome: true, email: true } }, authorizer: { select: { identity: { select: { nome: true } } } } } });
    return NextResponse.json({ rows, canManage: own.has("acessos.assessoria.manage"),
      grantable: ADVISORY_PERMISSIONS.filter(p => ctx.session.membershipRole === "OWNER" || own.has(p)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { const e = permissionError(error); return NextResponse.json({ error: e.message }, { status: e.status }); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { session } = await requirePermission("acessos.assessoria.manage");
    const body = await request.json();
    if (!body || Object.keys(body).some(k => !["email", "purpose", "permissions", "startsAt", "expiresAt", "confirm"].includes(k))) advisoryError("Campos inválidos.");
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    const purpose = typeof body.purpose === "string" ? body.purpose.trim() : "";
    const start = body.startsAt ? new Date(body.startsAt) : new Date();
    const expiry = body.expiresAt ? new Date(body.expiresAt) : null;
    if (body.confirm !== true || !email.includes("@") || purpose.length < 3 || purpose.length > 500 ||
      !Number.isFinite(start.getTime()) || expiry && (!Number.isFinite(expiry.getTime()) || expiry <= start || expiry <= new Date())) advisoryError("Confirme assessor, finalidade, permissões e datas válidas.");
    const grant = await prisma.$transaction(async tx => {
      const manager = await advisoryManager(tx, session, body.permissions);
      const identity = await tx.authIdentity.findUnique({ where: { email }, select: { id: true, status: true } });
      if (identity?.status !== "ACTIVE") advisoryError("Conta ativa não encontrada. O assessor precisa ter identidade própria previamente habilitada.", 404);
      const created = await tx.advisoryAccessGrant.create({ data: { tenantId: session.tenantId, identityId: identity.id,
        purpose, permissions: manager.permissions, authorizedByMembershipId: manager.member.id, startsAt: start, expiresAt: expiry } });
      await writeAudit(tx, { ...auditContext(session), advisoryGrantId: created.id, action: "ADVISORY_GRANTED",
        resourceType: "AdvisoryAccessGrant", resourceId: created.id,
        metadata: { targetIdentityId: identity.id, permissions: manager.permissions, startsAt: start.toISOString(), expiresAt: expiry?.toISOString() ?? null } });
      return { id: created.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(grant, { status: 201 });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") return NextResponse.json({ error: "Já existe autorização vigente. Revogue a anterior antes de conceder outra." }, { status: 409 });
    if (code === "P2034") return NextResponse.json({ error: "Os acessos mudaram durante a operação. Recarregue e confira antes de tentar novamente." }, { status: 409 });
    const e = permissionError(error); return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
